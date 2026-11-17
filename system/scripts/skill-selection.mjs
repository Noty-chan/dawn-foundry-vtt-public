import {ATTRIBUTES} from './rules.mjs';

/** Select a free-play feature; a new Skill proposes its associated Attribute. */
export function selectFeature(selection, item) {
  if (!item || !['skill', 'ability', 'bond'].includes(item.type) || item.system?.archived) return selection;
  const deselecting = selection[item.type] === item.id;
  const next = {...selection, [item.type]: deselecting ? null : item.id};
  const attribute = item.system?.mechanics?.attribute;
  if (!deselecting && item.type === 'skill' && ATTRIBUTES.includes(attribute)) next.attribute = attribute;
  return next;
}
