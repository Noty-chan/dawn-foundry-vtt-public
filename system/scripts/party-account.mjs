const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
const busy=new WeakSet();

/** GM creates a personal Influence account without touching an existing one. */
export async function createPartyAccount({party,hero,player,user,isExecutor,actors,users,id,influence}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner||party.type!=='party')throw Error('partyAccountPermission');
 if(!validId(id)||!Number.isSafeInteger(influence)||influence<0||!hero?.uuid||hero.type!=='hero'||actors.get(hero.id)!==hero||!player||users.get(player.id)!==player||player.isGM||!hero.testUserPermission(player,'OWNER'))throw Error('partyAccountInvalid');
 if(busy.has(party))throw Error('partyAccountBusy');
 busy.add(party);
 try{
  const accounts=party.system?.participants;
  if(!accounts||accounts[id]||Object.values(accounts).some(a=>a?.heroUuid===hero.uuid||a?.foundryUserId===player.id))throw Error('partyAccountExists');
  const value={name:player.name,foundryUserId:player.id,heroUuid:hero.uuid,influence};
  if(!isExecutor()||actors.get(hero.id)!==hero||users.get(player.id)!==player||!hero.testUserPermission(player,'OWNER'))throw Error('partyAccountInvalid');
  try{
   const saved=await party.update({[`system.participants.${id}`]:value});
   if(!saved||JSON.stringify(party.system.participants?.[id])!==JSON.stringify(value))throw Error('Unconfirmed');
  }catch(cause){const error=new Error('partyAccountUncertain',{cause});error.accountId=id;throw error;}
  return {id,...value};
 }finally{busy.delete(party);}
}
