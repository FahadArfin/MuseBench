using System;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;
// Only the isolated smoke harness launches this fixture. No user app is touched.
class DesktopFixture {
 class UserClick : IMessageFilter {
  public bool PreFilterMessage(ref Message message){if(message.Msg==0x201)Console.WriteLine("fixture-clicked");return false;}
 }
 [STAThread] static void Main(string[] args) {
  Console.SetOut(new System.IO.StreamWriter(Console.OpenStandardOutput(),new System.Text.UTF8Encoding(false)){AutoFlush=true});
  var form=new Form { Text="Muse Desktop Assist isolated fixture", Location=new Point(60,60), Size=new Size(500,320), StartPosition=FormStartPosition.Manual };
  var edit=new TextBox { Name="fixtureEdit", AccessibleName="Fixture text", Location=new Point(20,30), Size=new Size(300,30) };
  var password=new TextBox { Name="fixturePassword", AccessibleName="Fixture password", UseSystemPasswordChar=true, Location=new Point(20,85), Size=new Size(300,30) };
  var button=new Button { AccessibleName="Fixture button", Text="Fixture button", Location=new Point(20,145), Size=new Size(160,40) };
  var drag=new Panel { AccessibleName="Fixture drag area", Location=new Point(350,30), Size=new Size(100,180), BackColor=Color.CadetBlue };
  Point start=Point.Empty;drag.MouseDown+=(s,e)=>start=e.Location;drag.MouseUp+=(s,e)=>{if(Math.Abs(e.X-start.X)+Math.Abs(e.Y-start.Y)>20){Console.WriteLine("dragged");Console.Out.Flush();}};
  form.Controls.Add(edit);form.Controls.Add(password);form.Controls.Add(button);form.Controls.Add(drag);
  var overlay=new Button { Text="Overlay fixture",AccessibleName="Overlay fixture",Location=button.Location,Size=button.Size,Visible=false };
  overlay.Click+=(s,e)=>Console.WriteLine("overlay-clicked");form.Controls.Add(overlay);
  edit.TextChanged+=(s,e)=>{Console.WriteLine("text:"+edit.Text);Console.Out.Flush();};
  button.Click+=(s,e)=>{Console.WriteLine("clicked");Console.Out.Flush();};
  form.Shown+=(s,e)=>{form.TopMost=true;form.Activate();edit.Focus();form.TopMost=false;Console.WriteLine("ready");Console.Out.Flush();};
  var input=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){if(line=="close"){form.BeginInvoke((Action)(()=>form.Close()));return;}if(line=="focus")form.BeginInvoke((Action)(()=>{form.Activate();edit.Focus();}));if(line=="move")form.BeginInvoke((Action)(()=>form.Location=new Point(600,120)));if(line=="overlay")form.BeginInvoke((Action)(()=>{overlay.Visible=true;overlay.BringToFront();Console.WriteLine("overlay-ready");}));if(line=="clear-overlay")form.BeginInvoke((Action)(()=>overlay.Visible=false));}});input.IsBackground=true;input.Start();
  Application.AddMessageFilter(new UserClick());Application.Run(form);
 }
}
