"""Synthetic browser contract; external APIs blocked, not live Auth/RLS proof."""
import functools,json,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
repo=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
s=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(repo)))
threading.Thread(target=s.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{s.server_port}'
with sync_playwright() as pw:
 b=pw.chromium.launch();p=b.new_page(service_workers='block');p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
 p.goto(base);p.wait_for_selector('#loginForm')
 p.evaluate('''()=>{window.__calls=[];fetchJson=async(url,o)=>{window.__calls.push({url,method:o.method,body:JSON.parse(o.body)});return{r:{ok:true},data:{ok:true,auth:{access_token:'fresh-fixture',refresh_token:'fixture'},preferred_login:'fixture',login_username:'fixture',display_name:'fixture',role:'employee'}}};rpc=async()=>{throw new Error('fixture boot blocked')};passwordChangeView({auth:{access_token:'old-fixture',refresh_token:'fixture'}})}''')
 p.locator('#newPassword').fill('Fixture9!Updated');p.locator('#confirmPassword').fill('Fixture9!Updated');p.locator('#passwordBtn').click();p.wait_for_timeout(100)
 calls=p.evaluate('window.__calls');assert len(calls)==1 and calls[0]['url'].endswith('/account-confirm-password'),'forced change must use one server-observed credential operation, never client Auth PUT followed by token-only confirmation'
 assert calls[0]['body']['new_password']=='Fixture9!Updated' and calls[0]['body']['operation_id'],'server operation must receive candidate and operation id'
 assert p.evaluate('session.token')=='fresh-fixture','replace invalidated session with server-issued fresh session'
 p.evaluate('sessionStorage.clear()');p.goto(base);p.wait_for_selector('#loginForm')
 results=[]
 for role,allow,key,linked,visible in [('ceo_office_manager',True,'fixture',True,True),('ceo_office_manager',False,'fixture',True,False),('employee',True,'fixture',True,False),('ceo_office_manager',True,'faisal',True,False),('ceo_office_manager',True,'fixture',False,False)]:
  p.evaluate('''x=>{session={role:x.role,display_name:'fixture'};sessionPermissions=x.allow?['profiles.admin_reset_password']:[];permissionsData={users:[{canonical_key:x.key,display_name:'fixture',user_id:x.linked?'fixture':null}],tabs:[],permissions:[]};permissionsSelectedUser=x.key;renderPermissionsApp()}''',{'role':role,'allow':allow,'key':key,'linked':linked})
  actual=p.locator('#resetAccountPasswordBtn').count()>0;results.append({'role':role,'expected':visible,'actual':actual});assert actual==visible,results
 p.evaluate('''()=>{session={token:'synthetic',role:'ceo_office_manager',display_name:'fixture'};sessionPermissions=['profiles.admin_reset_password'];fetchJson=async()=>({r:{ok:true},data:{ok:true}});openAdminPasswordReset({canonical_key:'fixture',user_id:'synthetic',display_name:'fixture'})}''')
 p.locator('#generateAdminPassword').click();assert p.locator('#saveAdminPassword').is_enabled();p.locator('#saveAdminPassword').click();p.wait_for_timeout(60)
 assert p.locator('#adminNewPassword').is_enabled() and p.locator('#adminNewPassword').get_attribute('readonly') is not None,'successful temporary password must remain selectable read-only for private delivery'
 assert p.locator('#toggleAdminNewPassword').is_enabled(),'password disclosure toggle must remain available after successful reset'
 p.evaluate('''()=>{document.querySelectorAll('.modal').forEach(e=>e.remove());window.__resetBodies=[];fetchJson=async(u,o)=>{window.__resetBodies.push(JSON.parse(o.body));return{r:{ok:false,status:503},data:{error:'credential_operation_unresolved'}}};openAdminPasswordReset({canonical_key:'fixture',user_id:'synthetic',display_name:'fixture'})}''')
 p.locator('#generateAdminPassword').click();p.locator('#saveAdminPassword').click();p.wait_for_timeout(80)
 assert p.locator('#adminNewPassword').get_attribute('readonly') is not None and p.locator('#adminConfirmPassword').get_attribute('readonly') is not None,'uncertain outcome must freeze original candidate'
 assert p.locator('#generateAdminPassword').is_disabled(),'uncertain result must not permit generation of a different password under the same operation'
 p.locator('#saveAdminPassword').click();p.wait_for_timeout(80)
 assert p.evaluate('window.__resetBodies.length===2&&window.__resetBodies[0].new_password===window.__resetBodies[1].new_password&&window.__resetBodies[0].operation_id===window.__resetBodies[1].operation_id'),'recovery must preserve candidate and operation identity'
 p.evaluate('''async()=>{document.querySelectorAll('.modal').forEach(e=>e.remove());session={app:'new',token:'synthetic',role:'employee'};saveSession();rpc=async()=>{const e=new Error('account unavailable');e.status=403;throw e};await boot()}''')
 assert p.locator('#loginForm').count()==1 and p.evaluate('session===null'),'credential-readiness rejection must recover to login, not retain an unusable session'
 p.evaluate('''async()=>{session={app:'new',token:'synthetic',role:'employee'};rpc=async()=>({ok:true,user_id:'11111111-1111-4111-8111-111111111111',must_change_password:true,can_edit_email:false});await boot()}''')
 assert p.locator('#passwordForm').count()==1 and p.locator('.workspace').count()==0,'narrow forced bootstrap must open change-only view'
 b.close()
s.shutdown();print(json.dumps({'passed':True,'mode':'isolated actual UI with blocked APIs','checks':16}))
