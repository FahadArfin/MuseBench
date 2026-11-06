"""Independent OOXML edit/save/reopen proof; run with LibreOffice's bundled Python.

The supplied portable soffice is launched headless with an isolated profile and
local named pipe. Originals are never saved; only generated copies are edited.
"""
import argparse, hashlib, json, os, pathlib, subprocess, time, traceback, uuid
import uno
import sys
sys.stdout.reconfigure(encoding="utf-8")

def props(**values):
    result=[]
    for key,value in values.items():
        prop=uno.createUnoStruct('com.sun.star.beans.PropertyValue')
        prop.Name=key;prop.Value=value;result.append(prop)
    return tuple(result)

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def url(path):return uno.systemPathToFileUrl(str(path.resolve()))

def main():
    parser=argparse.ArgumentParser()
    for name in ['soffice','docx','pptx','output']:parser.add_argument('--'+name,required=True,type=pathlib.Path)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    report={'status':'running','application':'LibreOffice','mode':'headless UNO, isolated profile and named pipe','originals':{'docx':{'path':str(args.docx),'sha256':sha(args.docx)},'pptx':{'path':str(args.pptx),'sha256':sha(args.pptx)}},'checks':[]}
    profile=args.output/'profile';pipe='musebench_office_'+uuid.uuid4().hex
    version=subprocess.run([str(args.soffice),'-env:UserInstallation='+url(profile),'--headless','--version'],capture_output=True,text=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
    report['version']=version.stdout.strip();log=(args.output/'office-process.log').open('w',encoding='utf-8')
    process=subprocess.Popen([str(args.soffice),'-env:UserInstallation='+url(profile),'--headless','--nologo','--nodefault','--norestore','--accept=pipe,name='+pipe+';urp;StarOffice.ComponentContext'],stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
    desktop=None;opened=[]
    try:
        local_context=uno.getComponentContext();resolver=local_context.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local_context)
        end=time.monotonic()+40;context=None
        while time.monotonic()<end:
            try:context=resolver.resolve('uno:pipe,name='+pipe+';urp;StarOffice.ComponentContext');break
            except Exception:time.sleep(.15)
        if context is None:raise RuntimeError('Isolated LibreOffice UNO connection unavailable')
        desktop=context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',context)
        def load(path):
            document=desktop.loadComponentFromURL(url(path),'_blank',0,props(Hidden=True,ReadOnly=False,MacroExecutionMode=4,UpdateDocMode=0))
            if document is None:raise RuntimeError('Independent Office could not open '+str(path))
            opened.append(document);return document
        def close(document):document.close(True);opened.remove(document)
        document=load(args.docx)
        assert document.supportsService('com.sun.star.text.TextDocument')
        before={'tables':document.TextTables.Count,'pictures':document.GraphicObjects.Count,'textPrefix':document.Text.String[:120]}
        assert before['tables']>0 and before['pictures']>0,'DOCX must contain editable tables and a picture'
        document.Text.insertString(document.Text.Start,'Independent Office edit — ',False)
        document.TextTables.getByIndex(0).getCellByName('A2').String='Office edited cell'
        docx_output=args.output/'office-edited.docx'
        document.storeAsURL(url(docx_output),props(FilterName='Office Open XML Text',Overwrite=True))
        document.storeToURL(url(args.output/'writer-layout.pdf'),props(FilterName='writer_pdf_Export',Overwrite=True))
        close(document);document=load(docx_output)
        assert document.Text.String.startswith('Independent Office edit — ')
        assert document.TextTables.getByIndex(0).getCellByName('A2').String=='Office edited cell'
        assert document.GraphicObjects.Count==before['pictures']
        report['docx']={'before':before,'after':{'tables':document.TextTables.Count,'pictures':document.GraphicObjects.Count,'textPrefix':document.Text.String[:120]},'output':str(docx_output),'sha256':sha(docx_output)}
        report['checks'].append('DOCX native text/table edited, saved as DOCX and reopened; image remains editable graphic')
        close(document)
        presentation=load(args.pptx);pages=presentation.getDrawPages();assert pages.Count>0
        page=pages.getByIndex(0);shapes=[page.getByIndex(i) for i in range(page.Count)]
        report['pptxShapes']=[{'type':shape.ShapeType,'services':list(shape.getSupportedServiceNames())} for shape in shapes]
        text_shapes=[s for s in shapes if s.ShapeType in ['com.sun.star.drawing.CustomShape','com.sun.star.drawing.TextShape'] and getattr(s,'String','')]
        native_shapes=[s for s in shapes if s.ShapeType in ['com.sun.star.drawing.CustomShape','com.sun.star.drawing.EllipseShape'] and not getattr(s,'String','')]
        table_shapes=[s for s in shapes if s.ShapeType=='com.sun.star.drawing.TableShape']
        chart_shapes=[s for s in shapes if s.ShapeType=='com.sun.star.drawing.OLE2Shape']
        assert text_shapes and native_shapes and table_shapes and chart_shapes,'PPTX needs native text, shape, table and chart'
        text_shapes[0].String='Independent Office editable title'
        native_shapes[0].FillColor=0x0099CC
        table_shapes[0].Model.getCellByPosition(0,1).String='Office edited table'
        chart=chart_shapes[0].Model;provider=chart.getDataProvider();chart_before=provider.getData()
        chart_after=[list(row) for row in chart_before];chart_after[0][0]=99.0
        provider.setData(tuple(tuple(row) for row in chart_after))
        pptx_output=args.output/'office-edited.pptx'
        presentation.storeAsURL(url(pptx_output),props(FilterName='Impress MS PowerPoint 2007 XML',Overwrite=True))
        close(presentation);presentation=load(pptx_output);page=presentation.getDrawPages().getByIndex(0);reopened_shapes=[page.getByIndex(i) for i in range(page.Count)]
        assert any(getattr(s,'String','')=='Independent Office editable title' for s in reopened_shapes)
        assert any(getattr(s,'FillColor',None)==0x0099CC for s in reopened_shapes)
        reopened_table=next(s for s in reopened_shapes if s.ShapeType=='com.sun.star.drawing.TableShape')
        assert reopened_table.Model.getCellByPosition(0,1).String=='Office edited table'
        reopened_chart=next(s for s in reopened_shapes if s.ShapeType=='com.sun.star.drawing.OLE2Shape').Model
        values=reopened_chart.getDataProvider().getData();assert values[0][0]==99.0
        presentation.storeToURL(url(args.output/'impress-layout.pdf'),props(FilterName='impress_pdf_Export',Overwrite=True))
        report['pptx']={'slides':presentation.getDrawPages().Count,'nativeObjects':page.Count,'chartBefore':chart_before,'chartAfter':values,'output':str(pptx_output),'sha256':sha(pptx_output)}
        report['checks'].append('PPTX native text/shape fill/table/chart data edited, saved as PPTX and independently reopened')
        close(presentation)
        assert sha(args.docx)==report['originals']['docx']['sha256'] and sha(args.pptx)==report['originals']['pptx']['sha256'],'Original fixture changed'
        report['checks'].append('Original source DOCX and PPTX hashes unchanged')
        report['status']='passed'
    except Exception:
        report['status']='failed';report['failure']=traceback.format_exc();print(report['failure'])
    finally:
        for document in list(opened):
            try:document.close(True)
            except Exception:pass
        if desktop is not None:
            try:desktop.terminate()
            except Exception:pass
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:process.terminate();process.wait(timeout=10)
        log.close();(args.output/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
        print(json.dumps(report,indent=2,ensure_ascii=False))
    return 0 if report['status']=='passed' else 1

if __name__=='__main__':raise SystemExit(main())
