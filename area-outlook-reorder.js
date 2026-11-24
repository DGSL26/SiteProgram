(()=>{
 const menuId='area-outlook-reorder-menu';
 let dragging=null,saving=false;
 const canUse=()=>Boolean(user)&&Boolean(projectId)&&window.matchMedia('(min-width:901px) and (hover:hover) and (pointer:fine)').matches;
 function closeMenu(){document.getElementById(menuId)?.remove()}
 function showMenu(event){
  if(!canUse()||activeView!=='overview'||areaOutlookReorderMode)return;
  const header=event.target.closest('#extraView [data-area-order-header]');
  if(!header)return;
  event.preventDefault();closeMenu();
  const menu=document.createElement('div');menu.id=menuId;menu.className='area-outlook-reorder-menu';menu.style.left=Math.min(event.clientX,window.innerWidth-150)+'px';menu.style.top=Math.min(event.clientY,window.innerHeight-54)+'px';
  const button=document.createElement('button');button.type='button';button.textContent='Reorder';button.addEventListener('click',()=>{closeMenu();areaOutlookReorderMode=true;renderPage()});menu.append(button);document.body.append(menu);button.focus();
 }
 function clearDrag(){document.querySelectorAll('.area-outlook-row.is-area-dragging,.area-outlook-row.is-area-drop-target').forEach(row=>row.classList.remove('is-area-dragging','is-area-drop-target'));dragging=null}
 async function persistOrder(table){
  if(saving||!user||!projectId)return;
  const keys=[...table.querySelectorAll(':scope > .area-outlook-row[data-area-order-key]')].map(row=>row.dataset.areaOrderKey);
  if(!keys.length)return;
  saving=true;table.classList.add('area-order-saving');
  try{
   const rows=keys.map((key,index)=>{
    const compactKey=key.startsWith('area:')?'a'+key.slice(5):'s'+key.slice(8),order= index.toString(36).padStart(2,'0'),uuid=AREA_ORDER_UUID_PREFIX+String(index+1).padStart(12,'0');
    return {project_id:projectId,sequence_key:uuid,name:AREA_ORDER_RECORD_NAME_PREFIX+order+' '+compactKey,updated_at:new Date().toISOString()};
   });
   const {data,error}=await db.from('schedule_sequences').upsert(rows,{onConflict:'project_id,sequence_key'}).select();
   if(error)throw error;
   const savedKeys=new Set(rows.map(row=>String(row.sequence_key))),stale=sequenceNames.filter(row=>String(row.name||'').startsWith(AREA_ORDER_RECORD_NAME_PREFIX)&&!savedKeys.has(String(row.sequence_key))).map(row=>String(row.sequence_key));
   sequenceNames=sequenceNames.filter(row=>!String(row.name||'').startsWith(AREA_ORDER_RECORD_NAME_PREFIX));sequenceNames.push(...(data||rows));
   if(stale.length){const {error:cleanupError}=await db.from('schedule_sequences').delete().eq('project_id',projectId).in('sequence_key',stale);if(cleanupError)console.warn('Could not remove older saved area order rows:',cleanupError.message||cleanupError)}
   renderPage();note('Area order saved.');
  }catch(error){renderPage();note('Could not save the area order: '+(error.message||'Please try again.'),true)}
  finally{saving=false;document.querySelector('.area-outlook-table')?.classList.remove('area-order-saving')}
 }
 document.addEventListener('contextmenu',showMenu);
 document.addEventListener('pointerdown',event=>{if(!event.target.closest('#'+menuId))closeMenu()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
 document.addEventListener('click',event=>{if(event.target.closest('[data-area-reorder-done]')){areaOutlookReorderMode=false;renderPage()}});
 document.addEventListener('dragstart',event=>{
  const row=event.target.closest('#extraView .area-outlook-row[draggable="true"]');
  if(!row||!canUse()||!areaOutlookReorderMode)return;
  dragging=row;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',row.dataset.areaOrderKey||'');
  requestAnimationFrame(()=>row.classList.add('is-area-dragging'));
 });
 document.addEventListener('dragover',event=>{
  if(!dragging||!canUse()||!areaOutlookReorderMode)return;
  const row=event.target.closest('#extraView .area-outlook-row[draggable="true"]');
  if(!row||row===dragging||row.parentElement!==dragging.parentElement)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  document.querySelectorAll('.area-outlook-row.is-area-drop-target').forEach(item=>item.classList.remove('is-area-drop-target'));
  row.classList.add('is-area-drop-target');
  const rect=row.getBoundingClientRect();
  row.parentElement.insertBefore(dragging,event.clientY<rect.top+rect.height/2?row:row.nextSibling);
 });
 document.addEventListener('drop',event=>{
  if(!dragging||!canUse()||!areaOutlookReorderMode)return;
  const table=dragging.closest('.area-outlook-table');if(!table)return;
  event.preventDefault();clearDrag();persistOrder(table);
 });
 document.addEventListener('dragend',clearDrag);
 window.addEventListener('resize',closeMenu);window.addEventListener('scroll',closeMenu,true);
})();
