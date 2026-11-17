// Avoid replacing a sheet while a user is editing an input. The ordinary
// focusout/change sequence can submit the form before the deferred render.
const pending=new WeakMap();
export function refreshSheetWhenIdle(app,{active=()=>document.activeElement,defer=fn=>setTimeout(fn,0)}={}){
 if(!app?.rendered||!app.element)return;
 const existing=pending.get(app),root=app.element;
 if(existing&&existing.root!==root){existing.root.removeEventListener('focusout',existing.handler);pending.delete(app);}
 const focused=active();
 if(focused&&root.contains(focused)&&focused.matches?.('input, textarea, select, [contenteditable="true"]')){
  if(pending.has(app))return;
  const handler=()=>defer(()=>{
   const current=pending.get(app);if(!current||current.handler!==handler)return;
   root.removeEventListener('focusout',handler);pending.delete(app);
   refreshSheetWhenIdle(app,{active,defer});
  });
  pending.set(app,{root,handler});root.addEventListener('focusout',handler);return;
 }
 const current=pending.get(app);if(current){current.root.removeEventListener('focusout',current.handler);pending.delete(app);}
 if(app.rendered)app.render();
}
