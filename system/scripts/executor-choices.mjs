/** Show GM names while retaining an obsolete configured value until changed. */
export function executorChoices(users,currentId,unassigned,unavailable){
  const choices={};
  for(const user of users??[]){
    if(user?.isGM&&typeof user.id==='string'&&user.id)choices[user.id]=user.name||user.id;
  }
  if(typeof currentId==='string'&&currentId&&!Object.hasOwn(choices,currentId))choices[currentId]=`${unavailable} (${currentId})`;
  if(!currentId)choices['']=unassigned;
  return choices;
}
