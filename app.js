import { firebaseConfig } from './firebase-config.js';

/* Los Cuates Corte Láser | Sistema sencillo de pedidos familiares */
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:2 }).format(Number(value) || 0);
const number = (value) => Math.max(0, Number(value) || 0);
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const isoDate = () => new Date().toISOString();
const day = () => { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const dateText = (iso) => { const d = new Date(iso || Date.now()); return Number.isNaN(d.getTime()) ? 'Sin fecha' : d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); };
const statuses = {waiting:['Por iniciar','waiting'],progress:['En producción','progress'],ready:['Listo','ready'],done:['Entregado','done'],cancel:['Cancelado','cancel']};
const categories = {inventory:'Inventario',operating:'Gasto operativo',equipment:'Equipo'};
const isCloudConfigured = Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PEGA_AQUI') && firebaseConfig.projectId && firebaseConfig.projectId !== 'TU_PROYECTO');
const state = { cloud:isCloudConfigured, user:null, authorized:!isCloudConfigured, orders:[], expenses:[], catalog:[], works:[], unsubscribeWorks:null, unsubscribeCatalog:null, currentView:'dashboard', editing:null, paying:null, firebase:null, unsubscribeOrders:null, unsubscribeExpenses:null };
let toastTimer;
let editSnapshot=null;
function toast(message, error=false) { const el=$('toast'); el.textContent=message; el.style.background=error?'#a54141':'#183548'; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),4400); }
function freshId() { const r = Math.random().toString(36).slice(2,8); return `${Date.now().toString(36)}${r}`; }
function createCode() { const d = new Date(); return `LC-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; }
function safeRead(key){try { return JSON.parse(localStorage.getItem(key)||'[]'); }catch { return []; }}
function refreshLocal(){ state.works=safeRead('loscuates-works-v1');state.catalog=safeRead('loscuates-materials-v1');state.orders=safeRead('loscuates-orders-v1'); state.expenses=safeRead('loscuates-expenses-v1'); render(); }
function localPersist(){localStorage.setItem('loscuates-orders-v1',JSON.stringify(state.orders));localStorage.setItem('loscuates-expenses-v1',JSON.stringify(state.expenses));render();}
function calc(order){ const t=number(order.total), rate=number(order.vatRate ?? 16); const vat=round(t*rate/(100+rate)); const base=round(t-vat);const material=round((order.materials||[]).reduce((s,m)=>s+number(m.qty)*number(m.unitCost),0));const extra=number(order.extras);const paid=round((order.payments||[]).reduce((s,p)=>s+number(p.amount),0));return {total:t,vat,base,material,extra,paid,pending:Math.max(0,round(t-paid)),profit:round(base-material-extra),collectedVat:round(paid*rate/(100+rate))}; }
function activeOrders(){ return state.orders.filter(o=>o.status!=='cancel'); }
function totals(){let sold=0,collected=0,pending=0,profit=0,iva=0,materials=0,allCashReceived=0;
for (const o of state.orders){const c=calc(o);allCashReceived+=c.paid;iva+=c.collectedVat;if(o.status==='cancel')continue;sold+=c.total;collected+=c.paid;pending+=c.pending;profit+=c.profit;materials+=c.material;}
const inventory=state.expenses.filter(e=>e.type==='inventory').reduce((s,e)=>s+number(e.amount),0);
const operating=state.expenses.filter(e=>e.type==='operating').reduce((s,e)=>s+number(e.amount),0);
const equipment=state.expenses.filter(e=>e.type==='equipment').reduce((s,e)=>s+number(e.amount),0);
return {sold:round(sold),collected:round(collected),pending:round(pending),profit:round(profit-operating),iva:round(iva),materials:round(materials),inventory:round(inventory),operating:round(operating),equipment:round(equipment),allCashReceived:round(allCashReceived)};}
function setView(view){state.currentView=view;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden',el.id!==`${view}-view`));document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));const titles={dashboard:'Tu negocio, en orden.',new:state.editing?'Editar pedido':'Nueva orden de trabajo',orders:'Tus pedidos.',expenses:'Compras y gastos.',settings:'Configuración.'};$('page-title').textContent=titles[view]||titles.dashboard;window.scrollTo({top:0,behavior:'smooth'});if(view==='new')previewOrder();}
function render(){renderCatalog();renderWorks();renderDashboard();renderOrders();renderExpenses();renderSettings();}
function investmentMetrics(t){
 const cashBeforeEquipment=round(t.allCashReceived-t.inventory-t.operating);
 const netCash=round(cashBeforeEquipment-t.equipment);
 const conservative=round(netCash-t.iva);
 const remaining=round(Math.max(0,-netCash));
 const progress=t.equipment>0?Math.min(100,Math.max(0,cashBeforeEquipment/t.equipment*100)):0;
 return {cashBeforeEquipment,netCash,conservative,remaining,progress,profit:round(t.profit)};
}
function renderInvestment(t){
 const m=investmentMetrics(t);
 $('investment-cash').textContent=money(m.netCash);
 $('investment-cash').style.color=m.netCash<0?'#ff9c9c':'#70d8b0';
 $('investment-status').textContent=m.netCash<0?'Falta recuperar efectivo invertido':t.equipment>0?'Inversión recuperada en efectivo registrado':'Balance del efectivo registrado';
 $('investment-remaining').textContent=money(m.remaining);
 $('investment-progress').style.width=m.progress+'%';
 $('investment-percent').textContent=t.equipment>0?m.progress.toFixed(1)+'% recuperado':'Sin inversión en equipo registrada';
 $('investment-reserved').textContent=money(m.conservative);
 $('investment-profit').textContent=money(m.profit);
 $('investment-profit').style.color=m.profit<0?'#ff9c9c':'#70d8b0';
}

function renderDashboard(){const t=totals();renderInvestment(t);$('kpi-collected').textContent=money(t.allCashReceived);$('kpi-pending').textContent=money(t.pending);$('kpi-profit').textContent=money(t.profit);$('kpi-iva').textContent=money(t.iva);$('summary-sales').textContent=money(t.sold);$('summary-material').textContent=money(t.materials);$('summary-operating').textContent=money(t.operating);$('summary-inventory').textContent=money(t.inventory);$('summary-equipment').textContent=money(t.equipment);const sum=t.sold||1;$('split-paid').style.width=`${Math.min(100,t.collected/sum*100)}%`;$('split-pending').style.width=`${Math.min(100,t.pending/sum*100)}%`;
const recent=[...state.orders].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);$('recent-empty').classList.toggle('hidden',recent.length>0);$('recent-tbody').innerHTML=recent.map(o=>{let c=calc(o);return `<tr><td><div class="order-title">${escapeHtml(o.customer || o.description || o.code)}</div><div class="order-sub">${escapeHtml(o.code)} · ${dateText(o.createdAt)}</div></td><td><span class="badge ${o.status}">${statuses[o.status]?.[0]||'Por iniciar'}</span></td><td class="money">${money(c.total)}</td><td class="money">${money(c.pending)}</td></tr>`;}).join('');}
function renderOrders(){const q=$('orders-search').value.trim().toLowerCase(),filter=$('orders-filter').value;const rows=[...state.orders].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).filter(o=>(filter==='all'||filter===o.status)&&[o.code,o.customer,o.description,o.notes].some(s=>(s||'').toLowerCase().includes(q)));$('orders-empty').classList.toggle('hidden',rows.length>0);$('orders-tbody').innerHTML=rows.map(o=>{const c=calc(o);const pct=c.total?Math.min(100,c.paid/c.total*100):0;return `<tr><td><div class="order-title">${escapeHtml(o.customer||o.description||'Cliente sin nombre')}</div><div class="order-sub">${escapeHtml(o.code)} · ${dateText(o.createdAt)}</div><div class="order-sub">${o.invoice?'Factura solicitada':'Sin solicitud de factura'}</div></td><td><select class="badge ${o.status}" data-status-id="${escapeHtml(o.id)}" aria-label="Cambiar estado de ${escapeHtml(o.code)}"><option value="waiting" ${o.status==='waiting'?'selected':''}>Por iniciar</option><option value="progress" ${o.status==='progress'?'selected':''}>En producción</option><option value="ready" ${o.status==='ready'?'selected':''}>Listo</option><option value="done" ${o.status==='done'?'selected':''}>Entregado</option><option value="cancel" ${o.status==='cancel'?'selected':''}>Cancelado</option></select></td><td class="money">${money(c.total)}</td><td><div class="money">${money(c.paid)}</div><div class="mini-progress"><span style="width:${pct}%"></span></div></td><td class="money">${o.status==='cancel'?'—':money(c.pending)}</td><td><div class="actions"><button class="pill-button" data-order-action="edit" data-id="${escapeHtml(o.id)}">Editar</button><button class="pill-button" data-order-action="pay" data-id="${escapeHtml(o.id)}" ${c.pending<=0||o.status==='cancel'?'disabled':''}>Cobrar</button>${o.status!=='cancel'?'<button class="pill-button btn-danger" data-order-action="cancel" data-id="'+escapeHtml(o.id)+'">Cancelar pedido</button>':''}</div></td></tr>`;}).join('');}
function renderExpenses(){const t=totals();$('expense-inventory').textContent=money(t.inventory);$('expense-operating').textContent=money(t.operating);$('expense-equipment').textContent=money(t.equipment);$('expense-total').textContent=money(t.inventory+t.operating+t.equipment);let sorted=[...state.expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));$('expense-list').innerHTML=sorted.length?sorted.map(e=>`<div class="expense-item"><div><strong><span class="type-dot" style="background:${e.type==='operating'?'#86aac7':e.type==='equipment'?'#7c7fb6':'#f0a670'}"></span>${escapeHtml(e.description)}</strong><div class="sub">${categories[e.type]||'Gasto'} · ${escapeHtml(e.date||'Sin fecha')} ${e.notes?' · '+escapeHtml(e.notes):''}</div></div><strong class="money">${money(e.amount)}</strong></div>`).join(''):'<div class="empty paper"><h3>Sin compras registradas</h3><p>Las compras de equipo, inventario y otros gastos aparecerán aquí.</p></div>';}
function renderSettings(){const connected=state.cloud&&Boolean(state.user)&&state.authorized;$('demo-banner').classList.toggle('hidden',state.cloud);$('mode-pill').classList.toggle('demo',!connected);$('mode-pill').innerHTML=`<span class="dot"></span>${connected?'En línea · Compartido':state.cloud?'Conectando...':'Modo local'}`;$('side-mode').textContent=connected?'Firebase sincronizado':state.cloud?'Acceso protegido':'Datos en este navegador';$('side-user').textContent=displayIdentity(state.user?.email)||'Los Cuates';$('settings-mode').textContent=connected?'Tu cuenta está conectada a Firebase y se sincroniza con otros usuarios autorizados.':state.cloud?'Firebase está configurado. Inicia sesión para acceder.':'Modo local: los datos se guardan solo en este navegador.';$('settings-user').textContent=state.user?`Usuario: ${displayIdentity(state.user.email)} · UID: ${state.user.uid}`:'Usuario: sin iniciar sesión';$('logout').classList.toggle('hidden',!state.user);}


function workFeedback(message,error=false){
 const el=$('work-feedback');if(!el)return;
 el.textContent=message;el.classList.toggle('hidden',!message);el.classList.toggle('warning',error);
}

let editingWork=null;
function renderWorkMaterialOptions(){
 const select=$('work-material');if(!select)return;const old=select.value;
 select.innerHTML='<option value="">Selecciona el material</option>'+state.catalog.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name)+' · '+money(m.unitCost)+'</option>').join('');
 select.value=old;
}
function renderWorks(){
 const select=$('order-work');if(!select)return;const old=select.value;
 select.innerHTML='<option value="">Pedido personalizado</option>'+state.works.map(w=>'<option value="'+escapeHtml(w.id)+'">'+escapeHtml(w.name)+' · '+money(w.price)+'</option>').join('');select.value=old;
 $('work-list').innerHTML=state.works.map(w=>'<div class="expense-item"><div><strong>'+escapeHtml(w.name)+'</strong><div class="sub">1 material por unidad</div></div><div><strong class="money">'+money(w.price)+'</strong> <button type="button" class="pill-button" data-edit-work="'+escapeHtml(w.id)+'">Editar</button></div></div>').join('')||'<div class="info-note">Guarda un altar, altar de mascota o portarretrato para repetirlo en nuevos pedidos.</div>';
}
function workOrderValues(work,material,quantity){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw Error('Indica una cantidad entera de 1 a 10,000.');
 if(!material)throw Error('El material no está disponible. Edita el trabajo frecuente.');
 return {price:round(work.price*quantity),description:work.name+' × '+quantity,material:{type:material.type,name:material.name,qty:quantity,unitCost:material.unitCost}};
}
function applyWork(){
 if(state.editing)return toast('Usa trabajos frecuentes al crear un pedido nuevo.',true);
 const work=state.works.find(w=>w.id===$('order-work').value);if(!work)return toast('Elige un trabajo frecuente.',true);
 try{
 const values=workOrderValues(work,state.catalog.find(m=>m.id===work.materialId),Number($('order-work-qty').value));
 if(($('order-desc').value.trim()||number($('order-total').value)>0)&&!confirm('Se reemplazarán descripción, precio y materiales del formulario. ¿Aplicar el trabajo?'))return;
 $('order-desc').value=values.description;$('order-total').value=values.price;
 $('material-rows').innerHTML='';makeMaterialRow(values.material);previewOrder();
 toast('Trabajo cargado. Puedes modificar precio y materiales antes de guardar.');
 }catch(err){toast(err.message,true);}
}
function resetWorkForm(){editingWork=null;$('work-form').reset();$('work-save').textContent='Guardar trabajo';$('work-cancel').classList.add('hidden');}
async function saveWork(e){
 e.preventDefault();workFeedback('Guardando trabajo...');const name=$('work-name').value.trim(),price=round(Number($('work-price').value)),materialId=$('work-material').value;
 if(!name||!Number.isFinite(price)||price<=0||!state.catalog.some(m=>m.id===materialId))return toast('Indica nombre, precio y un material guardado.',true);
 const old=editingWork;const work={id:old?.id||freshId(),name,price,materialId,createdAt:old?.createdAt||isoDate(),updatedAt:isoDate(),updatedBy:state.user?.email||'Local'};
 const button=$('work-save');button.disabled=true;
 try{
 if(state.cloud){const {doc,runTransaction}=state.firebase.fire;const ref=doc(state.firebase.db,'works',work.id);await runTransaction(state.firebase.db,async tx=>{const snap=await tx.get(ref);if(old&&(!snap.exists()||snap.data().updatedAt!==old.updatedAt))throw Error('Otro familiar modificó el trabajo. Reabre Editar.');if(!old&&snap.exists())throw Error('El trabajo ya existe.');tx.set(ref,work);});}
 else{const idx=state.works.findIndex(w=>w.id===work.id);if(idx<0)state.works.push(work);else state.works[idx]=work;localStorage.setItem('loscuates-works-v1',JSON.stringify(state.works));renderWorks();}
 resetWorkForm();workFeedback('Trabajo frecuente guardado. Ya aparece en Nueva orden.');toast('Trabajo frecuente guardado.');
 }catch(err){workFeedback(err.code==='permission-denied'?'Firebase bloqueó el guardado. Publica las reglas de works en Firestore y recarga la página.':'No se pudo guardar: '+err.message,true);toast('No se pudo guardar: '+err.message,true);}finally{button.disabled=false;}
}
function workListeners(){
 $('work-form').addEventListener('submit',saveWork);$('work-form').addEventListener('invalid',()=>workFeedback('Completa nombre, precio y material antes de guardar.',true),true);$('work-cancel').addEventListener('click',resetWorkForm);
 $('apply-work').addEventListener('click',applyWork);
 $('work-list').addEventListener('click',e=>{const button=e.target.closest('[data-edit-work]');if(!button)return;const work=state.works.find(w=>w.id===button.dataset.editWork);if(!work)return;editingWork={...work};$('work-name').value=work.name;$('work-price').value=work.price;$('work-material').value=work.materialId;$('work-save').textContent='Actualizar trabajo';$('work-cancel').classList.remove('hidden');$('work-name').focus();});
}

function catalogOptions(){
 return '<option value="">Captura manual</option>'+state.catalog.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name)+' · '+money(m.unitCost)+'</option>').join('');
}
function renderCatalog(){renderWorkMaterialOptions();renderWorks();
 if(!$('catalog-list'))return;
 $('catalog-list').innerHTML=state.catalog.map(m=>'<div class="expense-item"><strong>'+escapeHtml(m.name)+'</strong><span class="money">'+money(m.unitCost)+'</span></div>').join('')||'<div class="info-note">Aún no hay materiales guardados.</div>';
 document.querySelectorAll('.m-catalog').forEach(el=>{const old=el.value;el.innerHTML=catalogOptions();el.value=old;});
}
async function saveCatalog(e){
 e.preventDefault();
 const name=$('catalog-name').value.trim(),type=$('catalog-type').value,unitCost=Number($('catalog-cost').value);
 if(!name||!Number.isFinite(unitCost)||unitCost<0)return toast('Escribe nombre y costo válido.',true);
 const button=$('catalog-save');button.disabled=true;
 const item={id:freshId(),name,type,unitCost,createdAt:isoDate(),updatedBy:state.user?.email||'Local'};
 try{
  if(state.cloud){const {doc,setDoc}=state.firebase.fire;await setDoc(doc(state.firebase.db,'materials',item.id),item);}
  else{state.catalog.push(item);localStorage.setItem('loscuates-materials-v1',JSON.stringify(state.catalog));renderCatalog();}
  $('catalog-form').reset();toast('Material guardado. Ya puedes elegirlo en Nueva orden.');
 }catch(err){toast('No se pudo guardar: '+err.message,true);}finally{button.disabled=false;}
}
function catalogListeners(){
 $('catalog-form').addEventListener('submit',saveCatalog);
 $('material-rows').addEventListener('change',e=>{
  if(!e.target.matches('.m-catalog'))return;
  const item=state.catalog.find(m=>m.id===e.target.value);if(!item)return;
  const row=e.target.closest('.material-row');
  row.querySelector('.m-type').value=item.type;row.querySelector('.m-name').value=item.name;row.querySelector('.m-price').value=item.unitCost;
  previewOrder();
 });
}

function makeMaterialRow(data={type:'mdf',name:'',qty:1,unitCost:0}){const el=document.createElement('div');el.className='material-row';el.innerHTML=`<div class="field material-catalog"><label>Material guardado</label><select class="m-catalog">${catalogOptions()}</select></div><div class="field material-type"><label>Tipo</label><select class="m-type"><option value="mdf">MDF / madera</option><option value="termo">Termo</option><option value="otro">Otro</option></select></div><div class="field material-name"><label>Descripción</label><input class="m-name" maxlength="90" placeholder="80 × 60 cm / 30 oz"></div><div class="field material-qty"><label>Cantidad</label><input class="m-qty" type="number" min="1" step="1" inputmode="numeric" required></div><div class="field material-price"><label>Costo unitario $</label><input class="m-price" type="number" min="0" step="1" inputmode="numeric" required></div><button type="button" class="material-remove" title="Eliminar material" aria-label="Eliminar material">✕</button><label class="material-save" style="grid-column:1 / -1;display:flex;align-items:center;gap:10px"><input class="m-save" type="checkbox" style="width:18px;height:18px"> Guardar este material en el catálogo al guardar el pedido</label>`;el.querySelector('.m-type').value=data.type||'otro';el.querySelector('.m-name').value=data.name||'';el.querySelector('.m-qty').value=data.qty??1;el.querySelector('.m-price').value=data.unitCost??0;$('material-rows').appendChild(el);previewOrder();}
function getMaterials(){return [...$('material-rows').querySelectorAll('.material-row')].map(row=>({type:row.querySelector('.m-type').value,name:row.querySelector('.m-name').value.trim(),qty:number(row.querySelector('.m-qty').value),unitCost:number(row.querySelector('.m-price').value)}));}
function finalOrderTotal(price, invoice, original=null){
 const entered=round(number(price));
 if(original && Boolean(original.invoice)===invoice){
  const originalPrice=original.invoice?round(number(original.total)/1.16):round(number(original.total));
  if(entered===originalPrice)return round(number(original.total));
 }
 return invoice?round(entered*1.16):entered;
}
function formOrderTotal(){return finalOrderTotal($('order-total').value,$('order-invoice').value==='si',state.editing?editSnapshot:null);}
function previewOrder(){const invoice=$('order-invoice').value==='si';$('order-price-label').textContent=invoice?'1. Precio antes de IVA ($) *':'1. Precio final del pedido ($) *';$('order-price-help').textContent=invoice?'Se agregará 16% al precio capturado.':'El precio capturado será el total a cobrar.';const total=formOrderTotal(),paid=number($('order-advance').value);const mat=getMaterials().reduce((s,m)=>s+m.qty*m.unitCost,0),extra=number($('order-extras').value);const vat=round(total*16/116),base=round(total-vat);$('pv-total').textContent=money(total);$('pv-base').textContent=money(base);$('pv-iva').textContent=money(vat);$('pv-material').textContent=money(mat);$('pv-extra').textContent=money(extra);$('pv-profit').textContent=money(base-mat-extra);$('pv-paid').textContent=money(paid);$('pv-pending').textContent=money(Math.max(0,total-paid));$('pv-profit').style.color=base-mat-extra<0?'#b54747':'#167854';}
function clearOrderForm(){$('order-advance').disabled=false;$('order-advance').title='';$('order-form').reset();$('order-advance').value='0';$('order-extras').value='0';$('material-rows').innerHTML='';makeMaterialRow({type:'mdf',name:'',qty:1,unitCost:0});state.editing=null;$('order-work').value='';$('order-work-qty').value=1;$('order-form-heading').textContent='Nueva orden de trabajo';$('cancel-edit').classList.add('hidden');$('save-order').textContent='Guardar pedido →';previewOrder();}
async function persistOrder(o, expectedOrder=undefined, frequentWork=null, savedMaterials=[]){if(state.cloud){const {doc,runTransaction}=state.firebase.fire;const ref=doc(state.firebase.db,'orders',o.id);const expected=expectedOrder===undefined?state.orders.find(x=>x.id===o.id):expectedOrder;await runTransaction(state.firebase.db,async tx=>{const snap=await tx.get(ref);if(expected){if(!snap.exists())throw Error('El pedido ya no existe.');const current=snap.data();if((current.updatedAt||current.createdAt)!==(expected.updatedAt||expected.createdAt))throw Error('Otro familiar actualizó este pedido. Reabre el pedido antes de guardar.');}else if(snap.exists())throw Error('El pedido ya existe.');tx.set(ref,o);for(const item of savedMaterials)tx.set(doc(state.firebase.db,'materials',item.id),item);if(frequentWork)tx.set(doc(state.firebase.db,'works',frequentWork.id),frequentWork);});}else{const idx=state.orders.findIndex(e=>e.id===o.id);if(idx<0)state.orders.push(o);else state.orders[idx]=o;if(frequentWork){state.works.push(frequentWork);localStorage.setItem('loscuates-works-v1',JSON.stringify(state.works));}if(savedMaterials.length){state.catalog.push(...savedMaterials);localStorage.setItem('loscuates-materials-v1',JSON.stringify(state.catalog));renderCatalog();}localPersist();}}
async function persistExpense(e){if(state.cloud){const {doc,setDoc}=state.firebase.fire;await setDoc(doc(state.firebase.db,'expenses',e.id),e);}else{if(!state.expenses.some(x=>x.id===e.id))state.expenses.push(e);localPersist();}}
async function changeStatus(id,status){
 if(!statuses[status])return;
 const order=state.orders.find(o=>o.id===id);if(!order||order.status===status)return;
 const paid=calc(order).paid;
 if(status==='cancel'){
  const warning=paid>0?' Tiene '+money(paid)+' en pagos recibidos. Cancelar no devuelve ese dinero; los pagos se conservarán.':'';
  if(!confirm('¿Cancelar el pedido '+order.code+'? Se excluirá de ventas vigentes y saldos por cobrar, y quedará en el historial.'+warning)){render();return;}
 }
 try{
  const fields={status,updatedAt:isoDate(),updatedBy:state.user?.email||'Local'};
  if(state.cloud){
   const {doc,runTransaction}=state.firebase.fire;const ref=doc(state.firebase.db,'orders',id);
   await runTransaction(state.firebase.db,async tx=>{
    const snap=await tx.get(ref);if(!snap.exists())throw Error('El pedido ya no existe.');
    const current=snap.data();
    if(current.status!==order.status)throw Error('Otro familiar cambió el estado. Revisa el pedido antes de continuar.');
    if(status==='cancel'&&calc(current).paid!==paid)throw Error('Cambió el dinero recibido. Revisa los pagos antes de cancelar.');
    tx.update(ref,fields);
   });
  }else{await persistOrder({...order,...fields});}
  toast(status==='cancel'?'Pedido cancelado. Se conservó el historial.':'Estado actualizado.');
 }catch(e){toast('No se pudo actualizar: '+(e.message||e),true);render();}
}

function frequentWorkFromOrder(name, price, materials, catalog, creator){
 const cleanName=String(name||'').trim().replace(/\s*×\s*\d+\s*$/,'');
 if(!cleanName||cleanName.length>120)throw Error('Para guardar el trabajo, escribe una descripción de hasta 120 caracteres.');
 if(materials.length!==1)throw Error('Este trabajo frecuente necesita una sola presentación de material (MDF, termo u otro). Puedes guardar el pedido sin marcar la casilla.');
 const used=materials[0];
 if(!Number.isSafeInteger(used.qty)||used.qty<1)throw Error('Indica una cantidad entera de unidades de material.');
 const material=catalog.find(m=>m.type===used.type&&m.name===used.name);
 if(!material)throw Error('Primero guarda o selecciona ese material en el catálogo. Si es nuevo, guarda primero el pedido con la casilla de material y después edítalo para guardar el trabajo frecuente.');
 const unitPrice=round(number(price)/used.qty);
 if(unitPrice<=0)throw Error('El precio por trabajo debe ser mayor que cero.');
 return {id:freshId(),name:cleanName,price:unitPrice,materialId:material.id,createdAt:isoDate(),updatedAt:isoDate(),updatedBy:creator};
}

function newCatalogMaterials(materials, flags, catalog, creator){
 const result=[];
 materials.forEach((m,i)=>{
  if(!flags[i])return;
  if(!m.name||m.name.length>90)throw Error('Escribe el nombre del material que quieres guardar.');
  if(!Number.isFinite(m.unitCost)||m.unitCost<0||m.unitCost>=1e9)throw Error('Revisa el costo del material.');
  const existing=[...catalog,...result].find(x=>x.type===m.type&&x.name.toLowerCase()===m.name.toLowerCase());
  if(existing){
   if(existing.unitCost!==m.unitCost)throw Error('El material "'+m.name+'" ya existe con otro costo. Cambia el nombre o desmarca la casilla para conservar el catálogo.');
   return;
  }
  result.push({id:freshId(),name:m.name,type:m.type,unitCost:m.unitCost,createdAt:isoDate(),updatedBy:creator});
 });
 return result;
}

async function saveOrder(e){e.preventDefault();const old=state.editing?editSnapshot:null;const total=formOrderTotal();const advance=round(number($('order-advance').value));const materials=getMaterials();if(!total)return toast('Indica un total mayor que cero.',true);if(!materials.length||materials.some(m=>m.qty<=0))return toast('Agrega materiales con cantidad válida.',true);if(advance>total)return toast('El anticipo no puede exceder el total.',true);const alreadyPaid=old?calc(old).paid:advance;if(alreadyPaid>total)return toast(`Ya se han cobrado ${money(alreadyPaid)}. No puedes poner un total menor.`,true);
let savedMaterials=[];
try{savedMaterials=newCatalogMaterials(materials,[...$('material-rows').querySelectorAll('.m-save')].map(x=>x.checked),state.catalog,state.user?.email||'Local');}catch(err){return toast(err.message,true);}
let frequentWork=null;
if($('save-as-work').checked){
 try{frequentWork=frequentWorkFromOrder($('order-desc').value,$('order-total').value,materials,state.catalog,state.user?.email||'Local');
 if(state.works.some(w=>w.name.toLowerCase()===frequentWork.name.toLowerCase()))return toast('Ese trabajo ya está guardado. Desmarca la casilla para guardar solo el pedido o cambia el precio del trabajo en Ajustes.',true);
 }catch(err){return toast(err.message,true);}
}
const submit=$('save-order');submit.disabled=true;let newOrder={id:old?.id||freshId(),code:old?.code||createCode(),createdAt:old?.createdAt||isoDate(),createdBy:old?.createdBy||state.user?.email||'Local',customer:$('order-customer').value.trim(),description:$('order-desc').value.trim(),total,materials,extras:round(number($('order-extras').value)),invoice:$('order-invoice').value==='si',vatRate:16,status:$('order-status').value,notes:$('order-notes').value.trim(),payments:old?.payments|| (advance>0?[{id:freshId(),amount:advance,date:isoDate(),registeredBy:state.user?.email||'Local',type:'anticipo'}]:[]),updatedAt:isoDate(),updatedBy:state.user?.email||'Local'};
try{await persistOrder(newOrder,old,frequentWork,savedMaterials);toast(savedMaterials.length?'Pedido y materiales guardados en el catálogo.':frequentWork?'Pedido y trabajo frecuente guardados.':old?'Pedido actualizado.':'Pedido registrado correctamente.');clearOrderForm();setView('orders');}catch(err){toast('Error al guardar: '+(err.message||err),true);}finally{submit.disabled=false;}}
function editOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;clearOrderForm();state.editing=o.id;editSnapshot=JSON.parse(JSON.stringify(o));$('order-form-heading').textContent='Editar '+o.code;$('order-total').value=o.invoice?round(number(o.total)/1.16):o.total;$('order-customer').value=o.customer||'';$('order-desc').value=o.description||'';$('material-rows').innerHTML='';(o.materials||[]).forEach(makeMaterialRow);if(!(o.materials||[]).length)makeMaterialRow();$('order-advance').value=calc(o).paid;$('order-advance').disabled=true;$('order-advance').title='Para agregar dinero utiliza el botón Cobrar de la lista de pedidos.';$('order-invoice').value=o.invoice?'si':'no';$('order-status').value=o.status;$('order-extras').value=o.extras||0;$('order-notes').value=o.notes||'';$('cancel-edit').classList.remove('hidden');$('save-order').textContent='Actualizar pedido →';setView('new');previewOrder();}
function resetEdit(){ $('order-advance').disabled=false;clearOrderForm(); }
function startPay(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const c=calc(o);if(c.pending<=0)return toast('Este pedido ya está liquidado.');state.paying=id;$('payment-desc').textContent=`${o.code} · Saldo pendiente: ${money(c.pending)}`;$('payment-amount').value=c.pending;$('payment-amount').max=c.pending;$('payment-dialog').showModal();}
async function addPayment(e){e.preventDefault();const amt=round(number($('payment-amount').value)),id=state.paying;const old=state.orders.find(o=>o.id===id);if(!old||amt<=0)return toast('Captura un importe válido.',true);if(amt>calc(old).pending)return toast('El abono supera lo pendiente.',true);const submit=$('payment-form').querySelector('[type=submit]');submit.disabled=true;
try {const p={id:freshId(),amount:amt,date:isoDate(),registeredBy:state.user?.email||'Local',type:'abono'};if(state.cloud){const {doc,runTransaction}=state.firebase.fire;const ref=doc(state.firebase.db,'orders',id);await runTransaction(state.firebase.db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw Error('El pedido ya no existe');const dbOrder=snap.data();if(dbOrder.status==='cancel')throw Error('El pedido fue cancelado.');if(amt>calc(dbOrder).pending)throw Error('El pago excede el saldo actualizado');tx.update(ref,{payments:[...(dbOrder.payments||[]),p],updatedAt:isoDate(),updatedBy:state.user?.email||''});});}else{old.payments.push(p);old.updatedAt=isoDate();localPersist();}$('payment-dialog').close();toast(`Abono de ${money(amt)} registrado.`);}catch(err){toast('No se pudo registrar el pago: '+(err.message||err),true);}finally{submit.disabled=false;}}
async function saveExpense(e){e.preventDefault();const amount=round(number($('expense-amount').value));if(!amount)return toast('El gasto debe ser mayor que cero.',true);const el=$('expense-form').querySelector('[type=submit]');el.disabled=true;const item={id:freshId(),description:$('expense-desc').value.trim(),amount,type:$('expense-type').value,date:$('expense-date').value||day(),notes:$('expense-notes').value.trim(),createdAt:isoDate(),createdBy:state.user?.email||'Local',origin:'manual'};try{await persistExpense(item);$('expense-form').reset();$('expense-date').value=day();toast('Compra o gasto guardado.');}catch(err){toast('No se pudo guardar: '+(err.message||err),true);}finally{el.disabled=false;}}
function csvValue(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function downloadFile(name,mime,text){const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCsv(){const header=['Código','Fecha','Cliente','Descripción','Estado','Total con IVA','Venta sin IVA','IVA estimado','Material','Otros costos','Utilidad estimada','Pagado','Por cobrar','Factura solicitada','Materiales detalle'];const data=[header,...state.orders.map(o=>{const c=calc(o);return[o.code,o.createdAt,o.customer,o.description,statuses[o.status]?.[0],c.total,c.base,c.vat,c.material,c.extra,c.profit,c.paid,c.pending,o.invoice?'Sí':'No',(o.materials||[]).map(m=>`${m.qty} ${m.type} ${m.name}: ${money(m.unitCost)}`).join(' | ')];})];downloadFile('los-cuates-pedidos-'+day()+'.csv','text/csv;charset=utf-8','\uFEFF'+data.map(row=>row.map(csvValue).join(',')).join('\r\n'));toast('CSV descargado.');}
function exportJson(){const backup={application:'Los Cuates Corte Láser',version:1,exportedAt:isoDate(),orders:state.orders,expenses:state.expenses,materials:state.catalog,works:state.works};downloadFile('los-cuates-respaldo-'+day()+'.json','application/json',JSON.stringify(backup,null,2));toast('Respaldo JSON descargado.');}
function addListeners(){workListeners();catalogListeners();document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.view==='new'&&!state.editing){resetEdit();}setView(btn.dataset.view);}));$('order-form').addEventListener('submit',saveOrder);$('expense-form').addEventListener('submit',saveExpense);$('expense-date').value=day();$('material-rows').addEventListener('click',e=>{if(e.target.closest('.material-remove')){const rows=$('material-rows').querySelectorAll('.material-row');if(rows.length<=1)return toast('Deja al menos un material.');e.target.closest('.material-row').remove();previewOrder();}});$('material-rows').addEventListener('input',previewOrder);$('add-material').addEventListener('click',()=>makeMaterialRow({type:'termo',name:'',qty:1,unitCost:0}));$('order-invoice').addEventListener('change',previewOrder);['order-total','order-advance','order-extras'].forEach(id=>$(id).addEventListener('input',previewOrder));$('cancel-edit').addEventListener('click',()=>{resetEdit();setView('orders');});$('orders-search').addEventListener('input',renderOrders);$('orders-filter').addEventListener('change',renderOrders);$('orders-tbody').addEventListener('change',e=>{if(e.target.matches('[data-status-id]'))changeStatus(e.target.dataset.statusId,e.target.value);});$('orders-tbody').addEventListener('click',e=>{const el=e.target.closest('[data-order-action]');if(!el)return;if(el.dataset.orderAction==='pay')startPay(el.dataset.id);if(el.dataset.orderAction==='edit')editOrder(el.dataset.id);if(el.dataset.orderAction==='cancel')changeStatus(el.dataset.id,'cancel');});$('payment-form').addEventListener('submit',addPayment);document.querySelectorAll('[data-close-dialog]').forEach(el=>el.addEventListener('click',()=>$(el.dataset.closeDialog).close()));$('export-csv').addEventListener('click',exportCsv);$('export-json').addEventListener('click',exportJson);$('logout').addEventListener('click',async()=>{if(state.firebase)await state.firebase.authMod.signOut(state.firebase.auth);});$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-feedback').textContent='Ingresando...';try{await state.firebase.authMod.signInWithEmailAndPassword(state.firebase.auth,loginIdentity($('login-email').value),$('login-password').value);$('login-feedback').textContent='';}catch(err){$('login-feedback').textContent=readableAuthError(err);}});$('forgot-password').addEventListener('click',async()=>{const email=$('login-email').value.trim();if(!email)return $('login-feedback').textContent='Escribe tu correo para recuperar la contraseña.';if(!email.includes('@')||email.toLowerCase().endsWith('@'+USERNAME_DOMAIN))return $('login-feedback').textContent='Si entras con usuario, pide al administrador que restablezca tu contraseña.';try{await state.firebase.authMod.sendPasswordResetEmail(state.firebase.auth,email);$('login-feedback').textContent='Si el correo existe, recibirás instrucciones para restablecer tu contraseña.';}catch(err){$('login-feedback').textContent=readableAuthError(err);}});$('copy-uid').addEventListener('click',async()=>{const uid=state.user?.uid;if(!uid)return;try{await navigator.clipboard.writeText(uid);toast('UID copiado.');}catch{toast('Selecciona y copia el UID manualmente.',true);}});$('pending-logout').addEventListener('click',async()=>state.firebase.authMod.signOut(state.firebase.auth));}
const USERNAME_DOMAIN='usuarios.loscuates.invalid';
function loginIdentity(value){
 const raw=String(value||'').trim();
 if(!raw)throw Error('Escribe tu correo o usuario.');
 if(raw.includes('@'))return raw;
 const username=raw.toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))throw Error('Usa de 3 a 32 caracteres: letras sin acentos, números, punto, guion o guion bajo.');
 return username+'@'+USERNAME_DOMAIN;
}
function displayIdentity(value){
 const email=String(value||'');
 return email.toLowerCase().endsWith('@'+USERNAME_DOMAIN)?email.slice(0,email.lastIndexOf('@')):email;
}
function readableAuthError(err){const code=err?.code||'';if(code==='auth/invalid-credential'||code==='auth/wrong-password'||code==='auth/user-not-found')return 'Correo, usuario o contraseña incorrectos.';if(code==='auth/too-many-requests')return 'Demasiados intentos. Inténtalo más tarde.';if(code==='auth/unauthorized-domain')return 'Autoriza este dominio en Firebase Authentication.';return 'Error de acceso: '+(err?.message||'desconocido');}
function accessLogin(pending=false){$('login').classList.remove('hidden');$('login-form').classList.toggle('hidden',pending);$('access-pending').classList.toggle('hidden',!pending);$('login-description').textContent=pending?'Tu cuenta necesita autorización del administrador.':'Inicia sesión con la cuenta creada para tu familia.';if(pending)$('pending-uid').textContent=state.user?.uid||'';}
function leaveCloud(){state.unsubscribeWorks?.();state.unsubscribeWorks=null;state.works=[];state.unsubscribeCatalog?.();state.unsubscribeCatalog=null;state.catalog=[];state.unsubscribeOrders?.();state.unsubscribeExpenses?.();state.unsubscribeOrders=null;state.unsubscribeExpenses=null;state.orders=[];state.expenses=[];state.authorized=false;render();}
async function initializeCloud(){try {const [appMod,authMod,fire]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]);const fbApp=appMod.initializeApp(firebaseConfig);const auth=authMod.getAuth(fbApp),db=fire.getFirestore(fbApp);state.firebase={auth,db,authMod,fire};authMod.onAuthStateChanged(auth,async user=>{leaveCloud();state.user=user;renderSettings();if(!user){accessLogin(false);return;}try{const snapshot=await fire.getDoc(fire.doc(db,'members',user.uid));if(!snapshot.exists()){accessLogin(true);return;}state.authorized=true;state.unsubscribeWorks=fire.onSnapshot(fire.collection(db,'works'),snapshot=>{state.works=snapshot.docs.map(d=>d.data());renderWorks();},e=>toast('Trabajos frecuentes: publica las reglas nuevas en Firebase. '+e.message,true));state.unsubscribeCatalog=fire.onSnapshot(fire.collection(db,'materials'),snapshot=>{state.catalog=snapshot.docs.map(d=>d.data());renderCatalog();},e=>{workFeedback('No se pudo cargar el catálogo de materiales. Revisa las reglas de materials en Firebase y recarga.',true);toast('Catálogo: '+e.message,true);});$('login').classList.add('hidden');state.unsubscribeOrders=fire.onSnapshot(fire.collection(db,'orders'),snapshot=>{state.orders=snapshot.docs.map(d=>d.data());render();},e=>toast('Error al sincronizar pedidos: '+e.message,true));state.unsubscribeExpenses=fire.onSnapshot(fire.collection(db,'expenses'),snapshot=>{state.expenses=snapshot.docs.map(d=>d.data());render();},e=>toast('Error al sincronizar gastos: '+e.message,true));renderSettings();}catch(err){accessLogin(true);toast('Error de autorización: '+err.message,true);}});accessLogin(false);}catch(err){accessLogin(false);$('login-feedback').textContent='No se pudo conectar con Firebase: '+(err.message||err);$('login-form').querySelector('[type=submit]').disabled=true;}}
function init(){const d=new Date();$('today-date').textContent=d.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();addListeners();makeMaterialRow({type:'mdf',name:'80 × 60 cm',qty:1,unitCost:30});if(state.cloud){render();initializeCloud();}else{refreshLocal();}};
init();
