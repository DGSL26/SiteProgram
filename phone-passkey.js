/* Phone-only passkey setup and signed-out task completion. */
const PHONE_COMPLETION_PROJECT_ID='48e3edba-3504-4f18-ac97-721065b9d2ab';
const PHONE_COMPLETION_READY_KEY='siteprogram:phone-completion-ready:'+PHONE_COMPLETION_PROJECT_ID;
let phoneSetupClient=null,phoneSetupBusy=false,phoneCompleteBusy=false,phoneHoldTimer=null,phoneHoldCard=null,phoneHoldOrigin=null;
const phonePasskeyStyles=document.createElement('style');
phonePasskeyStyles.textContent=`.phone-passkey-screen{position:fixed;inset:0;z-index:2147483000;background:#f5f7fa;display:grid;place-items:center;padding:24px}.phone-passkey-card{width:min(100%,480px);background:#fff;border:1px solid #dce4eb;border-radius:16px;padding:24px;box-shadow:0 12px 38px #10263d1a}.phone-passkey-card h1{margin:0 0 8px;color:#10263d}.phone-passkey-card p{color:#66768a;line-height:1.5}.phone-passkey-card form{display:grid;gap:12px}.phone-passkey-card label{display:grid;gap:6px;font-weight:650}.phone-passkey-card input{width:100%;padding:12px;border:1px solid #cbd5df;border-radius:8px;font:inherit}.phone-passkey-message{min-height:24px;color:#52677c}.phone-passkey-message.error{color:#b42318}.guest-complete-action{display:block!important;width:100%;margin-top:10px;padding:9px 12px;border:0;border-radius:7px;background:#087f86;color:#fff;font-family:inherit;font-size:14px;font-weight:600;line-height:1.2;cursor:pointer}.guest-complete-action:disabled{opacity:.65}.guest-complete-hold{outline:2px solid #078a91!important;outline-offset:2px}`;
document.head.append(phonePasskeyStyles);
function phonePasskeyClient(){if(!phoneSetupClient)phoneSetupClient=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,experimental:{passkey:true}}});return phoneSetupClient}
function phoneCompletionReady(){try{return localStorage.getItem(PHONE_COMPLETION_READY_KEY)==='1'}catch{return false}}
function showPhonePasskeySetup(){if(!new URLSearchParams(location.search).has('setup-phone-passkey'))return;if(!isPhoneDevice()){document.body.insertAdjacentHTML('beforeend','<main class="phone-passkey-screen"><section class="phone-passkey-card"><h1>Set up phone access</h1><p>Open this setup link on the phone that will use task completion.</p></section></main>');return}document.body.insertAdjacentHTML('beforeend',`<main class="phone-passkey-screen"><section class="phone-passkey-card"><h1>Set up this phone</h1><p>Sign in once with the SiteProgram account, then save a passkey for this phone. The normal app will remain signed out.</p><form id="phonePasskeySetupForm"><label>Email<input name="email" type="email" autocomplete="username" required value="elvira@dgsl.ie"></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">Continue with Face ID</button></form><p id="phonePasskeySetupMessage" class="phone-passkey-message" role="status" aria-live="polite"></p><button class="btn" type="button" onclick="location.replace(location.pathname)">Cancel</button></section></main>`);document.querySelector('#phonePasskeySetupForm').addEventListener('submit',registerPhonePasskey)}
async function registerPhonePasskey(event){
  event.preventDefault();
  if(phoneSetupBusy)return;
  phoneSetupBusy=true;
  let form=event.currentTarget,message=document.querySelector('#phonePasskeySetupMessage'),button=form.querySelector('button[type=submit]'),client=phonePasskeyClient();
  button.disabled=true;message.classList.remove('error');message.textContent='Checking the account…';
  try{
    let {data,error}=await client.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});
    if(error)throw error;
    if(!data.user||String(data.user.email||'').toLowerCase()!=='elvira@dgsl.ie')throw new Error('Use the SiteProgram owner account to set up these phones.');
    let claim=await client.rpc('claim_phone_completion_authorization',{p_project_id:PHONE_COMPLETION_PROJECT_ID});
    if(claim.error)throw claim.error;
    let {data:keys,error:keyError}=await client.auth.passkey.list();
    if(keyError)throw keyError;
    if((keys||[]).length>=2)throw new Error('Two passkeys are already registered. Remove one before adding this phone.');
    message.textContent='Follow the iPhone prompt to save this phone’s passkey…';
    let registered=await client.auth.registerPasskey();
    if(registered.error){
      let duplicate=registered.error.code==='webauthn_credential_exists'||/authenticator was previously registered|credential.*already.*registered/i.test(registered.error.message||'');
      if(!duplicate)throw registered.error;
      message.textContent='This passkey already exists. Confirm it with Face ID to finish setup…';
      await client.auth.signOut();
      let existing=await client.auth.signInWithPasskey();
      if(existing.error)throw existing.error;
      if(!existing.data.user||String(existing.data.user.email||'').toLowerCase()!=='elvira@dgsl.ie')throw new Error('The existing passkey belongs to a different account.');
      let verifiedClaim=await client.rpc('claim_phone_completion_authorization',{p_project_id:PHONE_COMPLETION_PROJECT_ID});
      if(verifiedClaim.error)throw verifiedClaim.error;
    }
    localStorage.setItem(PHONE_COMPLETION_READY_KEY,'1');
    message.textContent=registered.error?'Existing passkey confirmed. Signing out…':'This phone is set up. Signing out…';
    await client.auth.signOut();
    setTimeout(()=>location.replace(location.pathname),1100);
  }catch(error){
    try{await client.auth.signOut()}catch{}
    message.textContent=error?.message||'Could not set up this phone. Try again.';
    message.classList.add('error');button.disabled=false;
  }finally{phoneSetupBusy=false}
}function revealPhoneCompleteAction(card){if(!card?.isConnected||card.dataset.archived==='true'||card.querySelector('.guest-complete-action'))return;let completed=card.dataset.complete==='true',action=document.createElement('button');action.type='button';action.className='guest-complete-action';action.textContent=completed?'Mark incomplete':'Mark complete';action.setAttribute('aria-label',completed?'Mark this task incomplete':'Mark this task complete');action.addEventListener('click',event=>completePhoneTask(event,card.dataset.taskId));card.append(action)}
function clearPhoneHold(){if(phoneHoldTimer){clearTimeout(phoneHoldTimer);phoneHoldTimer=null}phoneHoldCard?.classList.remove('guest-complete-hold');phoneHoldCard=null;phoneHoldOrigin=null}
document.addEventListener('pointerdown',event=>{if(!isPhoneDevice()||user||!phoneCompletionReady()||event.pointerType!=='touch')return;let card=event.target.closest('#sequence .sequence-task-link,.mobile-overview-sequence-cards .sequence-task-link');if(!card||card.dataset.archived==='true'||event.target.closest('.guest-complete-action'))return;clearPhoneHold();phoneHoldCard=card;phoneHoldOrigin={x:event.clientX,y:event.clientY};phoneHoldTimer=setTimeout(()=>{if(phoneHoldCard?.isConnected){sequenceClickBlockUntil=Date.now()+1100;phoneHoldCard.classList.add('guest-complete-hold');revealPhoneCompleteAction(phoneHoldCard)}phoneHoldTimer=null},650)},{passive:true});
document.addEventListener('pointermove',event=>{if(!phoneHoldTimer||event.pointerType!=='touch'||!phoneHoldOrigin)return;if(Math.hypot(event.clientX-phoneHoldOrigin.x,event.clientY-phoneHoldOrigin.y)>12)clearPhoneHold()},{passive:true});
document.addEventListener('pointerup',clearPhoneHold,{passive:true});document.addEventListener('pointercancel',clearPhoneHold,{passive:true});
async function completePhoneTask(event,id){event?.preventDefault?.();event?.stopPropagation?.();if(phoneCompleteBusy)return;let task=[...tasks,...archivedTasks].find(row=>String(row.id)===String(id)),markIncomplete=task?.status==='complete'||task?.archive_reason==='completed';if(!task||task.archived_at&&task.archive_reason!=='completed'||markIncomplete&&task.archive_reason==='deleted'){note('This task is no longer available to update.',true);return}phoneCompleteBusy=true;let action=event?.currentTarget;if(action){action.disabled=true;action.textContent='Confirm with Face ID…'}let client=phonePasskeyClient();try{let {data,error}=await client.auth.signInWithPasskey();if(error)throw error;if(!data.user||String(data.user.email||'').toLowerCase()!=='elvira@dgsl.ie')throw new Error('That passkey is not registered to the SiteProgram owner account.');let result=markIncomplete?await client.rpc('uncomplete_phone_task',{p_project_id:PHONE_COMPLETION_PROJECT_ID,p_task_id:task.id}):await client.rpc('complete_phone_task',{p_project_id:PHONE_COMPLETION_PROJECT_ID,p_task_id:task.id,p_actual_start:task.actual_start||currentTaskStart(task),p_actual_finish:task.actual_finish||currentTaskFinish(task)});if(result.error)throw result.error;if(markIncomplete){Object.assign(task,{status:'planned',actual_start:null,actual_finish:null,archived_at:null,archive_reason:null});if(archivedTasks.includes(task)){archivedTasks=archivedTasks.filter(row=>String(row.id)!==String(task.id));tasks.push(task)}}else Object.assign(task,{status:'complete',actual_start:task.actual_start||currentTaskStart(task),actual_finish:task.actual_finish||currentTaskFinish(task),archived_at:null,archive_reason:null});render();note(markIncomplete?'Task marked incomplete.':'Task marked complete.');}catch(error){note(error?.message||'Could not update this task.',true);if(action?.isConnected){action.disabled=false;action.textContent=markIncomplete?'Mark incomplete':'Mark complete'}}finally{try{await client.auth.signOut()}catch{}phoneCompleteBusy=false}}
window.completePhoneTask=completePhoneTask;
showPhonePasskeySetup();
