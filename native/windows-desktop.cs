using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using Microsoft.Win32;

// Fixed-purpose, one-request desktop driver. No scripts, clipboard, shell or desktop capture.
class MuseBenchDesktop {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=16*1024*1024, RecursionLimit=24 };
 static int ParentId; static string ParentExe; static bool Dispatched;
 class Failure:Exception { public string Code; public Failure(string code,string message):base(message){Code=code;} }
 static void Fail(string code,string message){throw new Failure(code,message);}
 static Dictionary<string,object> Map(object value){var result=value as Dictionary<string,object>;if(result==null)Fail("invalid_request","Expected an object.");return result;}
 static object Value(Dictionary<string,object> input,string name){object value;return input.TryGetValue(name,out value)?value:null;}
 static string Str(Dictionary<string,object> input,string name,int max){var value=Value(input,name) as string;if(value==null||value.Length>max)Fail("invalid_request","Invalid "+name+".");return value;}
 static double Num(Dictionary<string,object> input,string name){var value=Value(input,name);if(!(value is int||value is long||value is double||value is decimal))Fail("invalid_request","Invalid numeric field.");double number=Convert.ToDouble(value,CultureInfo.InvariantCulture);if(double.IsNaN(number)||double.IsInfinity(number))Fail("invalid_request","Invalid numeric field.");return number;}
 static string Exe(Process process){var text=new StringBuilder(32768);int length=text.Capacity;if(!QueryFullProcessImageName(process.Handle,0,text,ref length))Fail("unavailable","Executable identity is unavailable.");return Path.GetFullPath(text.ToString());}
 static bool Same(string a,string b){return string.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
 static bool Blocked(string exe,int pid){
  if(pid==ParentId||pid==Process.GetCurrentProcess().Id||Same(exe,ParentExe))return true;
  string name=Path.GetFileNameWithoutExtension(exe).ToLowerInvariant();
  string[] names={"musebench","muse","codex","chatgpt","claude","electron","node","code","codium","cursor","windsurf","devenv","cmd","powershell","powershell_ise","pwsh","windowsterminal","wt","conhost","openconsole","bash","sh","zsh","fish","wsl","mintty","alacritty","wezterm","kitty","putty","ttermpro","hyper","tabby","wscript","cscript","mshta","rundll32","regsvr32","regedit","mmc","taskmgr","explorer","control","systemsettings","credentialuibroker","logonui","consent","winlogon","securityhealthsystray","applicationframehost","runas","keepass","keepassxc","1password","bitwarden","lastpass","dashlane","nordpass","msmpeng","sechealthui","securityhealthhost","mstsc"};
  foreach(string blocked in names)if(name==blocked||name.StartsWith(blocked+"-",StringComparison.Ordinal))return true;
  return name.Contains("codex")||name.Contains("chatgpt")||name.Contains("musebench")||name.Contains("password")||name.Contains("credential")||name.Contains("terminal")||name.Contains("security")||name.Contains("authenticator");
 }
 static bool Elevated(Process process){IntPtr token;if(!OpenProcessToken(process.Handle,8,out token))Fail("unavailable","Process privilege could not be checked.");try{int elevation=0,size;if(!GetTokenInformation(token,20,ref elevation,4,out size))Fail("unavailable","Process privilege could not be checked.");return elevation!=0;}finally{CloseHandle(token);}}
 static void Session(){
  using(var self=Process.GetCurrentProcess())using(var parent=Process.GetProcessById(ParentId)){
   if(self.SessionId!=parent.SessionId||!Environment.UserInteractive||Elevated(self))Fail("session_unavailable","An unlocked non-administrator user session is required.");
   IntPtr state;int length;if(!WTSQuerySessionInformation(IntPtr.Zero,self.SessionId,8,out state,out length))Fail("session_unavailable","The current session could not be checked.");
   try{if(length<4||Marshal.ReadInt32(state)!=0)Fail("session_unavailable","The Windows session is not active.");}finally{WTSFreeMemory(state);}
  }
  IntPtr desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)Fail("session_unavailable","The desktop is locked or secure.");
  try{var name=new StringBuilder(256);int needed;if(!GetUserObjectInformation(desktop,2,name,name.Capacity*2,out needed)||!Same(name.ToString(),"Default"))Fail("session_unavailable","The desktop is locked or secure.");}finally{CloseDesktop(desktop);}
 }
 static Dictionary<string,object> Rect(RECT r){return new Dictionary<string,object>{{"x",r.Left},{"y",r.Top},{"width",r.Right-r.Left},{"height",r.Bottom-r.Top}};}
 static Dictionary<string,object> Rect(System.Windows.Rect r){return new Dictionary<string,object>{{"x",(int)Math.Round(r.X)},{"y",(int)Math.Round(r.Y)},{"width",(int)Math.Round(r.Width)},{"height",(int)Math.Round(r.Height)}};}
 static Dictionary<string,object> Describe(IntPtr hwnd){
  uint pid;GetWindowThreadProcessId(hwnd,out pid);
  if(!IsWindow(hwnd)||!IsWindowVisible(hwnd)||GetAncestor(hwnd,2)!=hwnd||pid==0)Fail("stale_window","Window is unavailable.");
  using(var process=Process.GetProcessById((int)pid)){
   var exe=Exe(process);if(Blocked(exe,(int)pid))Fail("blocked_app","This application cannot be controlled.");
   if(process.SessionId!=Process.GetCurrentProcess().SessionId)Fail("session_unavailable","Window belongs to another session.");
   bool elevated=Elevated(process);if(elevated)Fail("elevated_app","Administrator windows cannot be controlled.");
   RECT rect;if(!GetWindowRect(hwnd,out rect))Fail("stale_window","Window bounds are unavailable.");
   var title=new StringBuilder(513);GetWindowText(hwnd,title,title.Capacity);
   var windowClass=new StringBuilder(256);if(GetClassName(hwnd,windowClass,windowClass.Capacity)==0)Fail("unavailable","Window class could not be checked.");string klass=windowClass.ToString().ToLowerInvariant();if(klass.Contains("consolewindowclass")||klass.Contains("cascadia")||klass.Contains("mintty")||klass.Contains("putty"))Fail("blocked_app","Terminal windows cannot be controlled.");
   string caption=title.ToString().ToLowerInvariant();foreach(string term in new[]{"devtools","developer tools","command prompt","windows powershell","windows terminal","windows security","credential manager","user account control","task manager","password manager","musebench","chatgpt","codex"})if(caption.Contains(term))Fail("blocked_app","This window cannot be controlled.");
   return new Dictionary<string,object>{{"handle",hwnd.ToInt64().ToString(CultureInfo.InvariantCulture)},{"pid",(int)pid},{"startedAt",process.StartTime.ToUniversalTime().ToString("O",CultureInfo.InvariantCulture)},{"executable",exe},{"appName",Path.GetFileNameWithoutExtension(exe)},{"title",title.ToString()},{"rect",Rect(rect)},{"elevated",elevated}};
  }
 }
 static IntPtr Verify(Dictionary<string,object> expected,bool bounds){
  long handle;if(!long.TryParse(Str(expected,"handle",24),NumberStyles.Integer,CultureInfo.InvariantCulture,out handle)||handle==0)Fail("stale_window","Window identity changed.");
  Dictionary<string,object> current;try{current=Describe(new IntPtr(handle));}catch(Failure e){if(e.Code=="blocked_app"||e.Code=="elevated_app"||e.Code=="session_unavailable")throw;Fail("stale_window","Window identity changed.");return IntPtr.Zero;}catch{Fail("stale_window","Window identity changed.");return IntPtr.Zero;}
  if(Num(expected,"pid")!=Convert.ToDouble(current["pid"])||Str(expected,"startedAt",80)!=(string)current["startedAt"]||!Same(Str(expected,"executable",32768),(string)current["executable"]))Fail("stale_window","Window identity changed.");
  if(bounds){var old=Map(Value(expected,"rect"));var now=Map(current["rect"]);foreach(string key in new[]{"x","y","width","height"})if(Num(old,key)!=Num(now,key))Fail("stale_window","Window moved or resized; inspect it again.");}
  return new IntPtr(handle);
 }
 static void Ready(IntPtr window){Session();if(IsIconic(window)||!IsWindowEnabled(window))Fail("window_unavailable","Window is minimized or disabled.");}
 static string AppId(string exe){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(exe.ToLowerInvariant()))).Replace("-","").ToLowerInvariant();}
 static Dictionary<string,object> App(string exe,bool launchable){return new Dictionary<string,object>{{"id",AppId(exe)},{"name",Path.GetFileNameWithoutExtension(exe)},{"executable",exe},{"launchable",launchable}};}
 static SortedDictionary<string,Dictionary<string,object>> Catalog(){
  var result=new SortedDictionary<string,Dictionary<string,object>>(StringComparer.OrdinalIgnoreCase);
  foreach(var hive in new[]{RegistryHive.CurrentUser,RegistryHive.LocalMachine})foreach(var view in new[]{RegistryView.Registry64,RegistryView.Registry32})try{
   using(var root=RegistryKey.OpenBaseKey(hive,view))using(var key=root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths")){
    if(key==null)continue;int count=0;foreach(var name in key.GetSubKeyNames()){if(++count>512)break;using(var app=key.OpenSubKey(name)){
     string exe=app==null?null:app.GetValue(null,null,RegistryValueOptions.DoNotExpandEnvironmentNames) as string;if(string.IsNullOrWhiteSpace(exe))continue;
     exe=Environment.ExpandEnvironmentVariables(exe.Trim().Trim('"'));if(!Path.IsPathRooted(exe)||!exe.EndsWith(".exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(exe)||Blocked(exe,0))continue;
     exe=Path.GetFullPath(exe);result[exe]=App(exe,true);
    }}
   }
  }catch{}
  return result;
 }
 static object Apps(){var apps=Catalog();EnumWindows((hwnd,data)=>{try{if(apps.Count>=512)return false;var window=Describe(hwnd);string exe=(string)window["executable"];if(!apps.ContainsKey(exe))apps[exe]=App(exe,false);}catch{}return true;},IntPtr.Zero);return new {ok=true,apps=new List<Dictionary<string,object>>(apps.Values)};}
 static object Windows(Dictionary<string,object> input){string exe=Path.GetFullPath(Str(input,"executable",32768));if(Blocked(exe,0))Fail("blocked_app","This application cannot be controlled.");var windows=new List<object>();EnumWindows((hwnd,data)=>{try{uint pid;GetWindowThreadProcessId(hwnd,out pid);using(var process=Process.GetProcessById((int)pid)){if(!Same(Exe(process),exe))return true;}if(windows.Count<64)windows.Add(Describe(hwnd));}catch{}return true;},IntPtr.Zero);return new {ok=true,windows=windows};}
 static object Open(Dictionary<string,object> input){
  var app=Map(Value(input,"app"));string exe=Path.GetFullPath(Str(app,"executable",32768));if(Blocked(exe,0)||Str(app,"id",100)!=AppId(exe))Fail("blocked_app","Invalid application identity.");
  if(Value(input,"window")!=null){var expected=Map(input["window"]);if(!Same(exe,Str(expected,"executable",32768)))Fail("stale_window","Application identity changed.");var window=Verify(expected,false);Session();Dispatched=true;
   MSG message;PeekMessage(out message,IntPtr.Zero,0,0,0);uint ignored;uint foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out ignored),targetThread=GetWindowThreadProcessId(window,out ignored),currentThread=GetCurrentThreadId();bool attached=false,targetAttached=false;
   try{if(foregroundThread!=0&&foregroundThread!=currentThread)attached=AttachThreadInput(currentThread,foregroundThread,true);if(targetThread!=foregroundThread&&targetThread!=currentThread)targetAttached=AttachThreadInput(currentThread,targetThread,true);ShowWindow(window,9);BringWindowToTop(window);SetForegroundWindow(window);}finally{if(targetAttached)AttachThreadInput(currentThread,targetThread,false);if(attached)AttachThreadInput(currentThread,foregroundThread,false);}
   for(int i=0;i<10&&GetForegroundWindow()!=window;i++)Thread.Sleep(20);
   if(GetForegroundWindow()!=window)Fail("focus_changed","Windows did not grant foreground focus.");return new {ok=true,window=Describe(window),focused=true};}
  var catalog=Catalog();if(!catalog.ContainsKey(exe))Fail("launch_unavailable","This application is not in the registered launch catalog; select an existing window.");
  Session();Dispatched=true;var process=Process.Start(new ProcessStartInfo {FileName=exe,UseShellExecute=false,Arguments="",WorkingDirectory=Path.GetDirectoryName(exe),CreateNoWindow=false});return new {ok=true,launched=true,pid=process.Id};
 }
 static string RuntimeId(AutomationElement element){return "rid:"+string.Join(".",Array.ConvertAll(element.GetRuntimeId(),v=>v.ToString(CultureInfo.InvariantCulture)));}
 static bool Protected(AutomationElement element){
  for(int i=0;i<32&&element!=null;i++){
   if(element.Current.IsPassword)return true;
   string name=element.Current.Name??"";string id=element.Current.AutomationId??"";string text=(name+" "+id).ToLowerInvariant();
   foreach(string term in new[]{"password","passcode","credential","secret key","api key","recovery phrase","one-time code","verification code","authentication code","security code","pin code","credit card","card number","cvv","cvc","console prompt","terminal","developer tools","devtools"})if(text.Contains(term))return true;
   element=TreeWalker.ControlViewWalker.GetParent(element);
  }
  return false;
 }
 static bool InWindow(AutomationElement element,IntPtr hwnd){var root=AutomationElement.FromHandle(hwnd);for(int i=0;i<64&&element!=null;i++){if(Automation.Compare(root,element))return true;element=TreeWalker.RawViewWalker.GetParent(element);}return false;}
 static List<AutomationElement> Elements(IntPtr hwnd){
  var result=new List<AutomationElement>();var queue=new Queue<AutomationElement>();queue.Enqueue(AutomationElement.FromHandle(hwnd));int seen=0;
  while(queue.Count>0&&seen++<512&&result.Count<200){var element=queue.Dequeue();try{
   var current=element.Current;if(current.ProcessId==0)continue;if(!current.IsOffscreen)result.Add(element);
   if(current.IsPassword)continue;int children=0;for(var child=TreeWalker.ControlViewWalker.GetFirstChild(element);child!=null&&children++<100;child=TreeWalker.ControlViewWalker.GetNextSibling(child))queue.Enqueue(child);
  }catch(ElementNotAvailableException){}}
  return result;
 }
 static object Inspect(Dictionary<string,object> expected,IntPtr hwnd){Ready(hwnd);var values=new List<object>();foreach(var element in Elements(hwnd)){try{var c=element.Current;var r=c.BoundingRectangle;if(r.IsEmpty||double.IsInfinity(r.X)||double.IsInfinity(r.Y))continue;bool protect=Protected(element);values.Add(new {runtimeId=RuntimeId(element),name=protect?"Protected control":(c.Name??"").Substring(0,Math.Min(512,(c.Name??"").Length)),role=c.ControlType.ProgrammaticName.Replace("ControlType.",""),rect=Rect(r),@protected=protect,enabled=c.IsEnabled});}catch(ElementNotAvailableException){}}Verify(expected,true);return new {ok=true,window=expected,elements=values,observation=new {createdAt=DateTime.UtcNow.ToString("O")}};}
 static object Capture(Dictionary<string,object> expected,IntPtr hwnd){
  Ready(hwnd);RECT rect;if(!GetWindowRect(hwnd,out rect))Fail("capture_unavailable","Window bounds are unavailable.");Verify(expected,true);int width=rect.Right-rect.Left,height=rect.Bottom-rect.Top;
  if(width<1||height<1||width>8192||height>8192||(long)width*height>16000000)Fail("capture_unavailable","Window dimensions exceed the capture limit.");
  using(var bitmap=new Bitmap(width,height,PixelFormat.Format32bppArgb)){
   using(var graphics=Graphics.FromImage(bitmap)){graphics.Clear(Color.Black);IntPtr dc=graphics.GetHdc();try{if(!PrintWindow(hwnd,dc,2))Fail("capture_unavailable","This application does not support window-only capture.");}finally{graphics.ReleaseHdc(dc);}}
   bool visible=false;for(int y=0;y<height&&!visible;y+=Math.Max(1,height/100))for(int x=0;x<width;x+=Math.Max(1,width/100)){var pixel=bitmap.GetPixel(x,y);if(pixel.R+pixel.G+pixel.B>12){visible=true;break;}}
   if(!visible)Fail("capture_unavailable","Window capture returned empty or protected pixels.");
   using(var stream=new MemoryStream()){bitmap.Save(stream,ImageFormat.Png);if(stream.Length>10*1024*1024)Fail("capture_unavailable","Window image exceeds the capture limit.");Verify(expected,true);return new {ok=true,window=expected,mimeType="image/png",data=Convert.ToBase64String(stream.ToArray()),width=width,height=height,bounds=Rect(rect)};}
  }
 }
 static POINT Point(Dictionary<string,object> point,Dictionary<string,object> expected){double x=Num(point,"x"),y=Num(point,"y");if(x<0||x>1||y<0||y>1)Fail("invalid_request","Point must be normalized to the target window.");var r=Map(expected["rect"]);return new POINT {X=(int)(Num(r,"x")+Math.Round(x*(Num(r,"width")-1))),Y=(int)(Num(r,"y")+Math.Round(y*(Num(r,"height")-1)))};}
 static void Live(Dictionary<string,object> expected,IntPtr hwnd,POINT point,string targetId=null){
  Session();Verify(expected,true);Ready(hwnd);if(GetForegroundWindow()!=hwnd)Fail("focus_changed","The approved window is no longer foreground.");
  if(GetAncestor(WindowFromPoint(point),2)!=hwnd)Fail("occluded","Another window covers the target point.");
  var hit=AutomationElement.FromPoint(new System.Windows.Point(point.X,point.Y));if(hit==null||hit.Current.ProcessId!=(int)Num(expected,"pid")||!InWindow(hit,hwnd))Fail("occluded","Target control does not belong to the approved application.");
  if(Protected(hit))Fail("protected_control","Protected controls cannot be operated.");
  if(targetId!=null){bool matches=false;for(int i=0;i<64&&hit!=null;i++){if(RuntimeId(hit)==targetId){matches=true;break;}hit=TreeWalker.RawViewWalker.GetParent(hit);}if(!matches)Fail("stale_element","Another control covers the inspected target.");}
 }
 static POINT Target(Dictionary<string,object> input,Dictionary<string,object> expected,IntPtr hwnd,bool keyboard){
  POINT point;AutomationElement target=null;
  if(Value(input,"runtimeId")!=null){string id=Str(input,"runtimeId",512);foreach(var element in Elements(hwnd))try{if(RuntimeId(element)==id){target=element;break;}}catch(ElementNotAvailableException){}
   if(target==null)Fail("stale_element","The inspected control no longer exists.");if(Protected(target))Fail("protected_control","Protected controls cannot be operated.");var c=target.Current;if(!c.IsEnabled||c.IsOffscreen||c.BoundingRectangle.IsEmpty)Fail("stale_element","The inspected control is unavailable.");var r=c.BoundingRectangle;point=new POINT {X=(int)(r.Left+r.Width/2),Y=(int)(r.Top+r.Height/2)};
  }else if(Value(input,"point")!=null)point=Point(Map(input["point"]),expected);else{Fail("invalid_request","An inspected runtimeId or normalized point is required.");return new POINT();}
  var bounds=Map(expected["rect"]);if(point.X<Num(bounds,"x")||point.X>=Num(bounds,"x")+Num(bounds,"width")||point.Y<Num(bounds,"y")||point.Y>=Num(bounds,"y")+Num(bounds,"height"))Fail("stale_element","Control is outside the approved window.");
  Live(expected,hwnd,point,target==null?null:RuntimeId(target));
  if(keyboard){var focus=AutomationElement.FocusedElement;if(focus==null||focus.Current.ProcessId!=(int)Num(expected,"pid")||!InWindow(focus,hwnd)||Protected(focus))Fail("protected_control","Keyboard focus is unavailable or protected.");
   if(target!=null&&RuntimeId(target)!=RuntimeId(focus))Fail("focus_changed","Keyboard focus differs from the inspected control.");
   var r=focus.Current.BoundingRectangle;if(r.IsEmpty||point.X<r.Left||point.X>=r.Right||point.Y<r.Top||point.Y>=r.Bottom)Fail("focus_changed","Keyboard focus differs from the target point.");
  }
  return point;
 }
 static INPUT Key(ushort key,bool up){return new INPUT {type=1,u=new INPUTUNION {ki=new KEYBDINPUT {wVk=key,dwFlags=up?2u:0u}}};}
 static INPUT Unicode(char c,bool up){return new INPUT {type=1,u=new INPUTUNION {ki=new KEYBDINPUT {wScan=c,dwFlags=4u|(up?2u:0u)}}};}
 static INPUT Mouse(uint flags,int data){return new INPUT {type=0,u=new INPUTUNION {mi=new MOUSEINPUT {dwFlags=flags,mouseData=unchecked((uint)data)}}};}
 static INPUT Move(POINT point){int x=GetSystemMetrics(76),y=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);return new INPUT {type=0,u=new INPUTUNION {mi=new MOUSEINPUT {dx=(int)Math.Round((point.X-x)*65535.0/Math.Max(1,width-1)),dy=(int)Math.Round((point.Y-y)*65535.0/Math.Max(1,height-1)),dwFlags=0x0001|0x8000|0x4000}}};}
 static void Send(List<INPUT> events,List<INPUT> release){Dispatched=true;try{if(SendInput((uint)events.Count,events.ToArray(),Marshal.SizeOf(typeof(INPUT)))!=events.Count)Fail("input_failed","Windows did not accept the full input batch.");}finally{if(release.Count>0)SendInput((uint)release.Count,release.ToArray(),Marshal.SizeOf(typeof(INPUT)));}}
 static ushort KeyCode(string key){switch(key){case "Enter":return 13;case "Tab":return 9;case "Escape":return 27;case "Backspace":return 8;case "Delete":return 46;case "ArrowLeft":return 37;case "ArrowUp":return 38;case "ArrowRight":return 39;case "ArrowDown":return 40;case "Home":return 36;case "End":return 35;case "PageUp":return 33;case "PageDown":return 34;case "Space":return 32;case "F5":return 116;}if(key.Length==1&&key[0]>='A'&&key[0]<='Z')return key[0];Fail("invalid_request","Key is outside the fixed safe key list.");return 0;}
 static HashSet<ushort> Modifiers(Dictionary<string,object> input,ushort code){
  var modifiers=Value(input,"modifiers") as object[];if(Value(input,"modifiers")!=null&&modifiers==null)Fail("invalid_request","Invalid key modifiers.");var seen=new HashSet<ushort>();
  if(modifiers!=null){if(modifiers.Length>2)Fail("invalid_request","Too many modifiers.");foreach(var value in modifiers){string modifier=value as string;ushort vk=modifier=="Ctrl"?(ushort)17:modifier=="Shift"?(ushort)16:modifier=="Alt"?(ushort)18:(ushort)0;if(vk==0||!seen.Add(vk))Fail("invalid_request","Invalid key modifier.");}}
  // Fixed Ctrl allowlist excludes shell, clipboard and OS-global shortcuts.
  if(seen.Contains(18)||(seen.Contains(17)&&!(code=='A'||code=='Z'||code=='Y'||code=='S'||code=='F'||code=='O'||code==9||code==8||code==46||(code>=33&&code<=40))))Fail("invalid_request","This shortcut is outside the safe key list.");return seen;
 }
 static object Input(Dictionary<string,object> input,string op,Dictionary<string,object> expected,IntPtr hwnd){
  bool keyboard=op=="type"||op=="key";var point=Target(input,expected,hwnd,keyboard);var events=new List<INPUT>();var release=new List<INPUT>();
  // Refuse physical or previous synthetic modifiers; never alter the user's held keys.
  foreach(int key in new[]{16,17,18,91,92,1,2,4})if((GetAsyncKeyState(key)&0x8000)!=0)Fail("input_busy","Release held modifier keys and mouse buttons before desktop input.");
  if(op=="type"){string text=Str(input,"text",4096);if(text.Length==0)Fail("invalid_request","Text is empty.");foreach(char c in text){if(char.IsControl(c))Fail("invalid_request","Use the key tool for control characters.");events.Add(Unicode(c,false));events.Add(Unicode(c,true));}}
  else if(op=="key"){
   string key=Str(input,"key",24);ushort code=KeyCode(key);var seen=Modifiers(input,code);
   foreach(ushort modifier in seen){events.Add(Key(modifier,false));release.Add(Key(modifier,true));}events.Add(Key(code,false));events.Add(Key(code,true));release.Add(Key(code,true));for(int i=release.Count-2;i>=0;i--)events.Add(release[i]);
  }
  else if(op=="click"){events.Add(Move(point));events.Add(Mouse(2,0));events.Add(Mouse(4,0));release.Add(Mouse(4,0));}
  else if(op=="scroll"){var delta=Map(Value(input,"delta"));double x=Num(delta,"x"),y=Num(delta,"y");if(Math.Abs(x)>10||Math.Abs(y)>10||Math.Truncate(x)!=x||Math.Truncate(y)!=y||(x==0&&y==0))Fail("invalid_request","Scroll delta must be integer notches between -10 and 10.");events.Add(Move(point));if(y!=0)events.Add(Mouse(0x800,(int)-y*120));if(x!=0)events.Add(Mouse(0x1000,(int)x*120));}
  else if(op=="drag"){
   var end=Point(Map(Value(input,"endPoint")),expected);events.Add(Move(point));events.Add(Mouse(2,0));release.Add(Mouse(4,0));
   for(int i=1;i<=16;i++){var next=new POINT {X=point.X+(end.X-point.X)*i/16,Y=point.Y+(end.Y-point.Y)*i/16};Live(expected,hwnd,next);events.Add(Move(next));}events.Add(Mouse(4,0));
  }
  Live(expected,hwnd,point,Value(input,"runtimeId") as string);if(keyboard)Target(input,expected,hwnd,true);Send(events,release);return new {ok=true,performed=true,window=Describe(hwnd)};
 }
 static object Dispatch(Dictionary<string,object> input){
  string op=Str(input,"op",20);if(op=="key")Modifiers(input,KeyCode(Str(input,"key",24)));Session();if(op=="apps")return Apps();if(op=="windows")return Windows(input);if(op=="open")return Open(input);
  if(op!="inspect"&&op!="capture"&&op!="click"&&op!="type"&&op!="key"&&op!="scroll"&&op!="drag")Fail("invalid_request","Unknown desktop operation.");
  var expected=Map(Value(input,"window"));var hwnd=Verify(expected,true);if(op=="inspect")return Inspect(expected,hwnd);if(op=="capture")return Capture(expected,hwnd);return Input(input,op,expected,hwnd);
 }
 [STAThread] static int Main(string[] args){
  Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
  if(args.Length!=2||args[0]!="--parent"||!int.TryParse(args[1],out ParentId)||ParentId<1)return 2;
  SetProcessDPIAware();
  try{using(var parent=Process.GetProcessById(ParentId)){ParentExe=Exe(parent);var watch=new Thread(()=>{try{parent.WaitForExit();}catch{}Environment.Exit(0);});watch.IsBackground=true;watch.Start();
   var deadline=new Thread(()=>{Thread.Sleep(12000);Environment.Exit(3);});deadline.IsBackground=true;deadline.Start();
   var line=new StringBuilder();int c;while((c=Console.Read())!=-1&&c!='\n'){if(line.Length>=65536)Fail("invalid_request","Request exceeds its limit.");line.Append((char)c);}if(line.Length==0)Fail("invalid_request","Request is empty.");
   object result=Dispatch(Map(Json.DeserializeObject(line.ToString())));Console.WriteLine(Json.Serialize(result));Console.Out.Flush();return 0;
  }}catch(Failure error){Console.WriteLine(Json.Serialize(new {ok=false,error=new {code=error.Code,message=error.Message},uncertain=Dispatched}));return 0;}catch{Console.WriteLine(Json.Serialize(new {ok=false,error=new {code="unavailable",message="Desktop access is unavailable; inspect again before retrying."},uncertain=Dispatched}));return 0;}
 }
 delegate bool EnumWindowsProc(IntPtr hwnd,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] struct RECT {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] struct POINT {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] struct MSG {public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public POINT pt;}
 [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint type;public INPUTUNION u;}
 [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {[FieldOffset(0)]public MOUSEINPUT mi;[FieldOffset(0)]public KEYBDINPUT ki;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {public int dx,dy;public uint mouseData,dwFlags,time;public UIntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {public ushort wVk,wScan;public uint dwFlags,time;public UIntPtr dwExtraInfo;}
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback,IntPtr data);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int size);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder text,int size);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool PeekMessage(out MSG message,IntPtr hwnd,uint min,uint max,uint remove);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref int size);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint first,uint second,bool attach);
 [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token,int info,ref int value,int size,out int returned);
 [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int length,out int needed);
 [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode)] static extern bool WTSQuerySessionInformation(IntPtr server,int session,int info,out IntPtr value,out int size);
 [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr memory);
}
