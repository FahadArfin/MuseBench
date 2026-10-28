// Names and relative allowances verified in Meta's subscription docs on 2026-10-28.
// Regional prices, eligibility and final benefits are always shown by Meta at checkout.
export const MUSE_PLANS=Object.freeze([
 {id:'everyday',name:'Everyday Usage',allowance:'Everyday coding',description:'Muse Spark, Muse Wonder and Muse Image for regular projects.'},
 {id:'high',name:'High Usage',allowance:'5× Everyday usage',description:'More room for daily coding and multimodal inputs.'},
 {id:'power',name:'Power Usage',allowance:'20× Everyday usage',description:'Includes Muse Wonder Full, with higher file uploads.'},
 {id:'maximum',name:'Maximum Usage',allowance:'80× Everyday usage',description:'The largest plan allowance, including Muse Wonder Full.'},
]);
export const BILLING_DESTINATIONS=Object.freeze({subscriptions:'https://accountscenter.meta.com/',apiBilling:'https://dev.meta.ai/billing/',apiKeys:'https://dev.meta.ai/',planDetails:'https://dev.meta.ai/docs/muse-code/subscriptions'});
