import {integer,npcStatistics} from './rules.mjs';

export function isCompoundProfile(entry){
  return entry?.type==='npc'&&entry.system?.presentation?.role==='enemy'
    &&entry.system.canonicalId?.startsWith('lionwing.npc.');
}

export function compoundStatistics(parts,tier,tieDefense='armor'){
  integer(tier,{min:0,max:6});
  if(parts.length<2||!parts.every(isCompoundProfile)||!['armor','evasion'].includes(tieDefense))throw Error('compoundInvalid');
  const stats=parts.map(part=>npcStatistics({...part.system,tier}));
  const frequencies=new Map();
  for(const {speed} of stats)frequencies.set(speed,(frequencies.get(speed)??0)+1);
  const speed=[...frequencies].sort(([speedA,countA],[speedB,countB])=>countB-countA||speedB-speedA)[0][0];
  const health=stats.reduce((sum,part)=>sum+part.health,0);
  const armor=Math.max(...stats.map(part=>part.armor));
  const evasion=Math.max(...stats.map(part=>part.evasion));
  const defense=armor===evasion?tieDefense:armor>evasion?'armor':'evasion';
  return {health,speed,armor:defense==='armor'?armor:0,evasion:defense==='evasion'?evasion:0};
}

/** Single native token and health pool. Separate turns and gates are tracked by the Narrator. */
export function compoundActorData(parts,{tier,tieDefense,name}){
  const stats=compoundStatistics(parts,tier,tieDefense);
  return {
    type:'npc',name,prototypeToken:{name,actorLink:false,disposition:-1},
    system:{
      tier,kind:'compound',presentation:{role:'enemy'},deployment:{requiresManual:true},
      statistics:Object.fromEntries(Object.entries(stats).map(([key,value])=>[key,{override:value}])),
      health:{value:stats.health},evasion:{value:stats.evasion},
      relations:{parts:parts.map(part=>({canonicalId:part.system.canonicalId,content:Object.fromEntries(['en','ru'].map(lang=>{
        const {name,passive}=part.system.content[lang];
        return [lang,{name,passive}];
      }))}))}
    },
    items:parts.flatMap(part=>(part.items??[]).filter(item=>item.type==='action').map(item=>{
      const data=structuredClone(item);
      delete data._id;
      return data;
    }))
  };
}
