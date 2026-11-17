import {rankExpenditure} from './gadgets.mjs';
import {validateCreation,integer} from './rules.mjs';
export function creationBudget(system,items){
 const live=Array.from(items).filter(i=>!i.system.archived),skills=live.filter(i=>i.type==='skill'),abilities=live.filter(i=>i.type==='ability');
 const expenditure=rankExpenditure(live),{skillRanks,abilityRanks}=expenditure;
 return {...expenditure,techniqueLevels:live.filter(i=>i.type==='technique').reduce((n,i)=>n+i.system.level,0),boons:live.filter(i=>i.type==='boon'&&!i.system.inherent).length,errors:validateCreation(system,live)};
}
export function abilityCost(words,rank=1,{freeCondition=false,specializedNoun=false,extraNoun=null}={}){
 integer(rank,{min:1,max:3});if(words.length!==3||words.some(w=>!w))throw Error('Choose a Verb, Noun and Condition');
 const [verb,noun,condition]=words;
 if(freeCondition&&!words.some(w=>w.marks?.includes('✢')))throw Error('A free condition requires a marked word');
 if(specializedNoun&&!noun.marks?.includes('✧'))throw Error('Only a marked category can be specialized');
 if(words.some(w=>w.marks?.includes('☾'))&&!Number.isSafeInteger(extraNoun?.cost))throw Error('Choose the additional Noun for X');
 const costs=[verb.cost??extraNoun?.cost,Math.max(0,noun.cost-(specializedNoun?1:0)),freeCondition?0:condition.cost];
 if(costs.some(c=>!Number.isSafeInteger(c)))throw Error('Invalid Ability word cost');
 const purchaseCost=Math.max(1,costs.reduce((n,c)=>n+c,0));return {purchaseCost,total:purchaseCost+rank-1};
}
export function tierIncrease(system,first,second){
 const keys=['body','talent','spirit','mind'];
 integer(system.tier,{min:1,max:5});
 if(!keys.includes(first)||!keys.includes(second)||first===second)throw Error('Choose two different Attributes');
 const attributes={...system.attributes};attributes[first]++;attributes[second]++;
 return {tier:system.tier+1,attributes,award:{tier:system.tier+1,attributes:[first,second],ranks:2,boons:1,techniqueLevels:2}};
}
export function developmentBudget(system,items){const budget=creationBudget(system,items);return {ranks:8+2*(system.tier-1)-budget.ranks,boons:2+system.tier-1-budget.boons,techniques:5+2*(system.tier-1)-budget.techniqueLevels};}
