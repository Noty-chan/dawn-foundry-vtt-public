const fields=new Set(['name','system.notes','system.mechanics.quantity']);

/** Only an owner may change a live equipment entry while the build is locked. */
export function inventoryChange(item,key,value,{editable=false}={}) {
  if(!editable||item?.type!=='equipment'||item.system?.archived||!fields.has(key))return null;
  if(key==='system.mechanics.quantity'){
    if(String(value).trim()==='')return null;
    const quantity=Number(value);
    if(!Number.isSafeInteger(quantity)||quantity<0)return null;
    return {[key]:quantity};
  }
  if(typeof value!=='string')return null;
  const update={[key]:value};
  if(key==='name'&&item.system?.content?.en?.name)update['system.overrides.name']=value;
  return update;
}
