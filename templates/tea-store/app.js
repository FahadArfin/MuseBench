/* MUSEBENCH_FILTER: false */
const FILTER_ENABLED = false;

export const teas = [
  { name:'Morning light', type:'GREEN TEA', note:'Bright, grassy & quietly uplifting', price:18, caffeine:true, color:'sage', icon:'✳', label:'A FRESH START' },
  { name:'Golden hour', type:'HERBAL BLEND', note:'Chamomile, honey notes & a little calm', price:16, caffeine:false, color:'gold', icon:'✺', label:'YOUR EVENING EXHALE' },
  { name:'A little grounding', type:'BLACK TEA', note:'Rich, rounded & beautifully familiar', price:20, caffeine:true, color:'clay', icon:'❋', label:'COME BACK TO YOURSELF' },
  { name:'Soft landing', type:'HERBAL BLEND', note:'Peppermint, lemon balm & easy evenings', price:17, caffeine:false, color:'rose', icon:'✽', label:'LET THE DAY GO' },
];
export function filterTeas(preference='all') { return preference==='caffeine-free' ? teas.filter(tea=>!tea.caffeine) : [...teas]; }
export const filterEnabled=FILTER_ENABLED;
export function renderStore(document) {
  const controls=document.getElementById('filters');
  if(FILTER_ENABLED) controls.innerHTML='<div class="filter-row" role="group" aria-label="Caffeine preference"><button class="filter active" data-filter="all" aria-pressed="true">All teas</button><button class="filter" data-filter="caffeine-free" aria-pressed="false">Caffeine free <span>☾</span></button></div>';
  function render(preference='all') {
    const collection=FILTER_ENABLED?filterTeas(preference):teas;
    document.getElementById('product-count').textContent=`${collection.length} thoughtfully blended teas`;
    document.getElementById('products').innerHTML=collection.map(tea=>`<article class="product"><div class="product-art ${tea.color}"><div class="pouch"><span class="pouch-brand">WILLOW & LEAF</span><span class="pouch-icon">${tea.icon}</span><strong>${tea.name}</strong><span class="pouch-kind">${tea.type}</span><span class="pouch-bottom">WHOLE LEAF · 50g</span></div><span class="art-label">${tea.label}</span></div><div class="product-title"><h3>${tea.name}</h3><span>$${tea.price}</span></div><p>${tea.note}</p><span class="caffeine">${tea.caffeine?'Naturally caffeinated':'Naturally caffeine free'}</span></article>`).join('');
  }
  controls.addEventListener('click',event=>{
    const button=event.target.closest('button[data-filter]');if(!button)return;
    for(const item of controls.querySelectorAll('button')){const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}
    render(button.dataset.filter);
  });render();
}
if(typeof document!=='undefined')renderStore(document);
