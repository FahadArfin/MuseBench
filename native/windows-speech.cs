using System;
using System.Diagnostics;
using System.Globalization;
using System.Speech.Recognition;
using System.Threading;
using System.Web.Script.Serialization;

// Fixed-purpose local dictation. No network, workspace access, or audio storage.
class MuseBenchSpeech {
  static readonly object outputLock = new object();
  static void Emit(object value) { lock(outputLock) { Console.WriteLine(new JavaScriptSerializer().Serialize(value)); Console.Out.Flush(); } }
  static int Main(string[] args) {
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    var installed = SpeechRecognitionEngine.InstalledRecognizers();
    if (installed.Count == 0) { Emit(new {kind="error",code="language"}); return 1; }
    var info = installed[0];
    foreach(var candidate in installed) if(candidate.Culture.Equals(CultureInfo.CurrentUICulture)) { info=candidate; break; }
    if(args.Length==1 && args[0]=="--probe") { Emit(new {available=true,language=info.Culture.Name}); return 0; }
    bool wave=args.Length==2 && args[0]=="--wave";
    int parentId;
    if(!wave && (args.Length!=2 || args[0]!="--parent" || !int.TryParse(args[1],out parentId))) return 2;
    if(!wave) {
      var parent=Process.GetProcessById(int.Parse(args[1]));
      var watcher=new Thread(()=>{try{parent.WaitForExit();}catch{} Environment.Exit(0);});watcher.IsBackground=true;watcher.Start();
    }
    try {
      using(var engine=new SpeechRecognitionEngine(info)) using(var done=new ManualResetEvent(false)) {
        engine.LoadGrammar(new DictationGrammar());
        engine.SpeechRecognized+=(s,e)=>{ if(!string.IsNullOrWhiteSpace(e.Result.Text)) Emit(new {kind="text",text=e.Result.Text}); };
        engine.RecognizeCompleted+=(s,e)=>done.Set();
        if(wave) engine.SetInputToWaveFile(args[1]); else engine.SetInputToDefaultAudioDevice();
        engine.RecognizeAsync(RecognizeMode.Multiple);
        Emit(new {kind="listening",language=info.Culture.Name});
        if(!wave) {
          var input=new Thread(()=>{try{Console.ReadLine();engine.RecognizeAsyncStop();}catch{} });input.IsBackground=true;input.Start();
        }
        if(!done.WaitOne(TimeSpan.FromSeconds(90))) { engine.RecognizeAsyncStop(); done.WaitOne(2500); }
        engine.RecognizeAsyncCancel();
        Emit(new {kind="done"});
      }
      return 0;
    } catch { Emit(new {kind="error",code="microphone"}); return 1; }
  }
}
