(function(){
'use strict';
var API='api.php',csrf='',D=null,saved='',mtime=0,cur='dashboard',mediaCache=null;
var app=document.getElementById('app');

/* ---------- tiny DOM helper (never uses innerHTML with data) ---------- */
function h(tag,attrs){
  var e=document.createElement(tag);
  if(attrs)for(var k in attrs){
    var v=attrs[k];
    if(v==null||v===false)continue;
    if(k==='class')e.className=v;
    else if(k==='text')e.textContent=v;
    else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),v);
    else if(k==='value')e.value=v;
    else e.setAttribute(k,v===true?'':v);
  }
  for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null||c===false)continue;if(Array.isArray(c))c.forEach(function(x){if(x!=null&&x!==false)e.appendChild(typeof x==='string'?document.createTextNode(x):x)});else e.appendChild(typeof c==='string'?document.createTextNode(c):c)}
  return e;
}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
var uid=0;function nid(){return 'f'+(++uid)}

function api(action,opt){
  opt=opt||{};
  var init={method:opt.body||opt.form?'POST':'GET',headers:{'X-CSRF-Token':csrf},credentials:'same-origin'};
  if(opt.body){init.body=JSON.stringify(opt.body);init.headers['Content-Type']='application/json'}
  if(opt.form)init.body=opt.form;
  return fetch(API+'?action='+action,init).then(function(r){return r.json().catch(function(){return {ok:false,error:'The server sent an unexpected reply.'}}).then(function(j){j._status=r.status;return j})});
}
function toast(msg,err){
  var t=h('div',{class:'toast'+(err?' err':''),role:err?'alert':'status',text:msg});
  document.body.appendChild(t);setTimeout(function(){t.remove()},err?7000:3200);
}
function slugify(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)}
function isDirty(){return D&&JSON.stringify(D)!==saved}
function touch(){var d=document.getElementById('dirty');if(!d)return;var on=isDirty();d.textContent=on?'Unsaved changes':'All changes saved';d.className='dirty'+(on?' on':'');var b=document.getElementById('savebtn');if(b)b.disabled=!on}
window.addEventListener('beforeunload',function(e){if(isDirty()){e.preventDefault();e.returnValue=''}});
function imgSrc(p){return !p?'':/^(https?:)?\/\//.test(p)||p[0]==='/'?p:'../'+p}

/* ---------- boot / login ---------- */
function boot(){
  api('me').then(function(j){
    csrf=j.csrf||'';
    if(!j.ok){clear(app);app.appendChild(h('p',{class:'boot',text:'Could not reach the admin service.'}));return}
    if(!j.configured){clear(app);app.appendChild(h('p',{class:'boot',text:'Admin is not set up: admin/data/auth.php is missing. Upload it from the package.'}));return}
    if(!j.auth)return loginView();
    if(j.mustChange)return passwordView(true);
    loadContent();
  });
}
function loginView(msg){
  clear(app);
  var u=h('input',{id:'lu',autocomplete:'username',value:'admin',required:true}),p=h('input',{id:'lp',type:'password',autocomplete:'current-password',required:true});
  var err=h('div',{class:'msg err',role:'alert',hidden:msg?null:true,text:msg||''});
  if(!msg)err.hidden=true;
  var f=h('form',{class:'card',onsubmit:function(e){
    e.preventDefault();err.hidden=true;
    api('login',{body:{user:u.value.trim(),password:p.value}}).then(function(j){
      if(j.ok){csrf=j.csrf;if(j.mustChange)passwordView(true);else loadContent()}
      else{err.textContent=j.error||'Sign in failed.';err.hidden=false;p.value='';p.focus()}
    });
  }},
    h('img',{src:'../images/bloom-logo-horizontal.png',alt:'Bloom Aesthetic and Laser Clinic'}),
    h('h1',{text:'Website admin'}),h('p',{text:'Sign in to edit your website.'}),err,
    h('div',{class:'field'},h('label',{for:'lu',text:'Username'}),u),
    h('div',{class:'field'},h('label',{for:'lp',text:'Password'}),p),
    h('button',{class:'btn primary',type:'submit',text:'Sign in'}));
  app.appendChild(h('div',{class:'login'},f));
  p.focus();
}
function passwordView(forced){
  clear(app);
  var cu=h('input',{id:'pc',type:'password',autocomplete:'current-password',required:true}),
      un=h('input',{id:'pu',autocomplete:'username',value:'admin',required:true}),
      n1=h('input',{id:'pn',type:'password',autocomplete:'new-password',required:true,minlength:10}),
      n2=h('input',{id:'pn2',type:'password',autocomplete:'new-password',required:true});
  var err=h('div',{class:'msg err',role:'alert'});err.hidden=true;
  var f=h('form',{class:'card',onsubmit:function(e){
    e.preventDefault();err.hidden=true;
    if(n1.value!==n2.value){err.textContent='The two new passwords do not match.';err.hidden=false;return}
    api('password',{body:{current:cu.value,new:n1.value,user:un.value.trim()}}).then(function(j){
      if(j.ok){toast('Password updated');loadContent()}else{err.textContent=j.error||'Could not update.';err.hidden=false}
    });
  }},
    h('h1',{text:forced?'Choose your own password':'Change password'}),
    h('p',{text:forced?'The password you were given is temporary. Set your own to continue (at least 10 characters).':'Use at least 10 characters.'}),err,
    h('div',{class:'field'},h('label',{for:'pu',text:'Username'}),un),
    h('div',{class:'field'},h('label',{for:'pc',text:'Current password'}),cu),
    h('div',{class:'field'},h('label',{for:'pn',text:'New password'}),n1),
    h('div',{class:'field'},h('label',{for:'pn2',text:'Repeat new password'}),n2),
    h('button',{class:'btn primary',type:'submit',text:'Save password'}));
  app.appendChild(h('div',{class:'login'},f));
  cu.focus();
}

function loadContent(){
  api('load').then(function(j){
    if(j.status===401||j._status===401)return loginView('Please sign in again.');
    if(!j.ok){clear(app);app.appendChild(h('div',{class:'login'},h('div',{class:'card'},h('h1',{text:'Could not load the website content'}),h('p',{text:j.error||''}),h('button',{class:'btn',onclick:function(){cur='backups';D={};shell()},text:'Open backups'}))));return}
    D=j.content;saved=JSON.stringify(D);mtime=j.mtime;shell();
  });
}

/* ---------- schema-driven fields ---------- */
function fText(def,o){
  var id=nid(),inp=h('input',{id:id,type:def.type==='time'?'time':'text','data-k':def.k,value:o[def.k]==null?'':o[def.k],placeholder:def.ph||null,readonly:def.readonly||null,maxlength:def.max||null});
  if(def.suggest){var dl=h('datalist',{id:id+'l'});def.suggest().forEach(function(s){dl.appendChild(h('option',{value:s}))});inp.setAttribute('list',id+'l');inp.addEventListener('focus',function(){clear(dl);def.suggest().forEach(function(s){dl.appendChild(h('option',{value:s}))})})}
  inp.addEventListener('input',function(){o[def.k]=inp.value;if(def.onInput)def.onInput(o,inp);touch()});
  return wrap(def,id,inp);
}
function fArea(def,o){
  var id=nid(),t=h('textarea',{id:id,'data-k':def.k,rows:def.rows||3,text:o[def.k]||''});
  t.addEventListener('input',function(){o[def.k]=t.value;touch()});
  return wrap(def,id,t);
}
function fSelect(def,o){
  var id=nid(),s=h('select',{id:id,'data-k':def.k}),opts=typeof def.options==='function'?def.options():def.options;
  opts.forEach(function(x){s.appendChild(h('option',{value:x[0],text:x[1],selected:String(o[def.k])===String(x[0])?true:null}))});
  s.addEventListener('change',function(){o[def.k]=def.num?+s.value:s.value;touch()});
  return wrap(def,id,s);
}
function fBool(def,o){
  var id=nid(),c=h('input',{id:id,type:'checkbox',checked:o[def.k]?true:null});
  c.addEventListener('change',function(){o[def.k]=c.checked;if(def.onInput)def.onInput(o,c);touch()});
  return h('div',{class:'field'},h('label',{class:'check',for:id},c,def.l),def.hint?h('div',{class:'hint',text:def.hint}):null);
}
function wrap(def,id,ctl){
  return h('div',{class:'field'},h('label',{for:id,text:def.l}),ctl,def.hint?h('div',{class:'hint',text:def.hint}):null);
}
function fImage(def,o){
  var pv=h('div',{class:'pv'}),lab=h('span',{class:'lab',text:def.l});
  function draw(){clear(pv);if(o[def.k])pv.appendChild(h('img',{src:imgSrc(o[def.k]),alt:''}));else pv.textContent='No image'}
  draw();
  var rm=h('button',{class:'btn sm',type:'button',text:'Remove',onclick:function(){o[def.k]='';draw();rm.hidden=true;touch()}});
  rm.hidden=!o[def.k];
  var pick=h('button',{class:'btn sm',type:'button',text:'Choose or upload',onclick:function(){openPicker(function(p){o[def.k]=p;draw();rm.hidden=false;touch()})}});
  return h('div',{class:'field'},h('div',{class:'lab',text:def.l}),h('div',{class:'img'},pv,h('div',{class:'row'},pick,rm)),def.hint?h('div',{class:'hint',text:def.hint}):null);
}
function fStrings(def,o){
  if(!Array.isArray(o[def.k]))o[def.k]=[];
  var arr=o[def.k],box=h('div',{class:'items'}),paste=h('div',{class:'field'});paste.hidden=true;
  function draw(){
    clear(box);
    arr.forEach(function(v,i){
      var inp=h('input',{value:v,'aria-label':def.l+' '+(i+1),placeholder:def.ph||null});
      inp.addEventListener('input',function(){arr[i]=inp.value;touch()});
      box.appendChild(h('div',{class:'srow'},inp,
        h('button',{class:'icon',type:'button',title:'Move up','aria-label':'Move up',disabled:i===0?true:null,onclick:function(){swap(arr,i,i-1);draw();touch()},text:'↑'}),
        h('button',{class:'icon',type:'button',title:'Move down','aria-label':'Move down',disabled:i===arr.length-1?true:null,onclick:function(){swap(arr,i,i+1);draw();touch()},text:'↓'}),
        h('button',{class:'icon',type:'button',title:'Remove','aria-label':'Remove',onclick:function(){arr.splice(i,1);draw();touch()},text:'×'})));
    });
  }
  var ta=h('textarea',{rows:5,placeholder:'One per line'});
  paste.appendChild(h('label',{text:'Paste a list, one item per line'}));paste.appendChild(ta);
  paste.appendChild(h('div',{class:'row'},h('button',{class:'btn sm primary',type:'button',text:'Add these',onclick:function(){ta.value.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean).forEach(function(s){arr.push(s)});ta.value='';paste.hidden=true;draw();touch()}}),h('button',{class:'btn sm',type:'button',text:'Cancel',onclick:function(){paste.hidden=true}})));
  draw();
  var addInput=function(){arr.push('');draw();touch();var ins=box.querySelectorAll('input');if(ins.length)ins[ins.length-1].focus()};
  return h('div',{class:'field'},h('div',{class:'lab',text:def.l}),def.hint?h('div',{class:'hint',text:def.hint}):null,box,paste,
    h('div',{class:'row'},h('button',{class:'btn sm',type:'button',text:def.add||'Add',onclick:addInput}),h('button',{class:'btn sm',type:'button',text:'Paste several',onclick:function(){paste.hidden=false;ta.focus()}})));
}
function swap(a,i,j){if(j<0||j>=a.length)return;var t=a[i];a[i]=a[j];a[j]=t}
function fList(def,o){
  if(!Array.isArray(o[def.k]))o[def.k]=[];
  var arr=o[def.k],box=h('div',{class:'items'}),openIdx=def.openFirst?0:-1;
  function draw(keepOpen){
    clear(box);
    arr.forEach(function(it,i){
      var tt=h('span',{class:'t'});function title(){tt.textContent=(def.title?def.title(it,i):'')||(def.noun||'Item')+' '+(i+1)}
      title();
      var d=h('details',{class:'item'});
      if(i===keepOpen)d.open=true;
      var ctr=h('span',{class:'row',onclick:function(e){e.stopPropagation()}});
      if(!def.fixed){
        ctr.appendChild(h('button',{class:'icon',type:'button',title:'Move up','aria-label':'Move up',disabled:i===0?true:null,onclick:function(e){e.preventDefault();swap(arr,i,i-1);draw(i-1);touch()},text:'↑'}));
        ctr.appendChild(h('button',{class:'icon',type:'button',title:'Move down','aria-label':'Move down',disabled:i===arr.length-1?true:null,onclick:function(e){e.preventDefault();swap(arr,i,i+1);draw(i+1);touch()},text:'↓'}));
        ctr.appendChild(h('button',{class:'icon',type:'button',title:'Delete','aria-label':'Delete '+(def.noun||'item'),onclick:function(e){e.preventDefault();if(confirm('Delete "'+(def.title?def.title(it,i):def.noun)+'"? You can undo by not saving, or restore from Backups.')){arr.splice(i,1);draw();touch()}},text:'×'}));
      }
      d.appendChild(h('summary',null,tt,ctr));
      var body=h('div',{class:'body'});
      renderFields(def.fields,it,body,function(){title()});
      d.appendChild(body);box.appendChild(d);
    });
    if(!arr.length)box.appendChild(h('p',{class:'hint',text:def.empty||'Nothing here yet.'}));
  }
  draw(openIdx);
  var kids=[h('div',{class:'lab',text:def.l}),def.hint?h('div',{class:'hint',text:def.hint}):null,box];
  if(!def.fixed)kids.push(h('div',null,h('button',{class:'btn sm primary',type:'button',text:def.addLabel||'Add',onclick:function(){arr.push(def.make());draw(arr.length-1);touch();var d=box.querySelectorAll('details.item');if(d.length){var l=d[d.length-1];l.scrollIntoView({block:'center'});var i=l.querySelector('input,textarea');if(i)i.focus()}}})));
  return h('div',{class:'field'},kids);
}
function renderFields(defs,o,into,onChange){
  defs.forEach(function(d){
    var el;
    switch(d.type){
      case 'area':el=fArea(d,o);break;
      case 'image':el=fImage(d,o);break;
      case 'select':el=fSelect(d,o);break;
      case 'bool':el=fBool(d,o);break;
      case 'strings':el=fStrings(d,o);break;
      case 'list':el=fList(d,o);break;
      case 'row':el=h('div',{class:'two'});renderFields(d.fields,o,el,onChange);break;
      case 'group':o[d.k]=o[d.k]||{};el=h('div',{class:'panel'},h('h2',{text:d.l}));renderFields(d.fields,o[d.k],el,onChange);break;
      case 'note':el=h('p',{class:'hint',text:d.text});break;
      default:el=fText(d,o);
    }
    if(onChange&&el.addEventListener){el.addEventListener('input',onChange);el.addEventListener('change',onChange)}
    into.appendChild(el);
  });
}

/* ---------- schemas ---------- */
var FOCUS=[['center','Centre'],['upper','Show more of the top'],['top','Show the very top'],['lower','Show more of the bottom']];
var ARTS=[['face','Face'],['body','Body'],['laser','Laser'],['hair','Hair'],['plus','Plus sign'],['globe','Globe'],['person','Person'],['flower','Flower']];
var ICONS=[['care','Heart'],['areas','Four squares'],['team','People']];
function allTreatmentNames(){var n=[];(D.areas||[]).forEach(function(a){a.groups.forEach(function(g){g.items.forEach(function(i){if(n.indexOf(i)<0)n.push(i)})})});return n}
function areaOptions(){return (D.areas||[]).map(function(a){return [a.key,a.title]})}
function img(k,l,hint){return {type:'image',k:k,l:l,hint:hint}}
function focus(k){return {type:'select',k:k||'focus',l:'Which part of the photo to show',options:FOCUS,hint:'Used when the photo is cropped to fit.'}}
function person(){return [{k:'name',l:'Name'},{k:'role',l:'Role or title',ph:'e.g. Aesthetic physician'},{type:'area',k:'bio',l:'Short bio',rows:3},img('photo','Portrait photo','A portrait (taller than wide) works best.')]}

var SCHEMA={
  site:[
    {type:'group',l:'Clinic details',k:'site',fields:[
      {k:'name',l:'Clinic name'},
      {type:'row',fields:[{k:'phone',l:'Phone (as shown)',ph:'04 399 3434'},{k:'phoneTel',l:'Phone for tap-to-call',ph:'+97143993434',hint:'Digits with country code, no spaces.'}]},
      {k:'email',l:'Email'},
      {k:'address',l:'Full address (shown on the contact blocks)'},
      {type:'row',fields:[{k:'streetAddress',l:'Street (for Google)',hint:'Used for search-engine information.'},{k:'locality',l:'Area and city (for Google)'}]},
      {k:'footerText',l:'Footer sentence'},
      {k:'copyright',l:'Copyright line'},
      {k:'seoTitle',l:'Browser tab / Google title for the home page'},
      {type:'area',k:'seoDesc',l:'Google description for the home page',rows:2,hint:'About 150 characters.'}]},
    {type:'list',k:'hours',l:'Opening hours',fixed:true,noun:'Day',title:function(o){return o.day+' — '+(o.closed?'Closed':o.open+' to '+o.close)},openFirst:false,
      fields:[{k:'day',l:'Day',readonly:true},{type:'bool',k:'closed',l:'Closed all day'},{type:'row',fields:[{k:'open',l:'Opens',type:'time'},{k:'close',l:'Closes',type:'time'}]}]}
  ],
  home:[{type:'group',l:'Top of the home page',k:'home',fields:[
      {k:'eyebrow',l:'Small label above the headline'},{type:'area',k:'title',l:'Headline',rows:2},{type:'area',k:'text',l:'Intro paragraph',rows:3},
      {type:'row',fields:[{k:'btn1',l:'Main button'},{k:'btn2',l:'Second button'}]},
      img('photo','Hero photo'),focus(),
      {type:'row',fields:[{k:'floatA',l:'Label under the treatment count'},{k:'floatB',l:'Label under the specialist count'}]}]},
    {type:'group',l:'Services block',k:'home',fields:[{type:'row',fields:[{k:'servicesEyebrow',l:'Small label'},{k:'servicesTitle',l:'Title'}]},{k:'servicesSub',l:'Sentence under the title'}]},
    {type:'group',l:'About block',k:'home',fields:[{type:'row',fields:[{k:'aboutEyebrow',l:'Small label'},{k:'aboutTitle',l:'Title'}]},{type:'area',k:'aboutText',l:'Paragraph',rows:3},{type:'strings',k:'aboutChecks',l:'Tick-list points',add:'Add a point'},{k:'aboutBtn',l:'Button text'},img('aboutPhoto','Photo'),focus('aboutFocus'),
      {type:'list',k:'features',l:'Three feature boxes',noun:'Box',title:function(o){return o.title},addLabel:'Add a box',make:function(){return {icon:'care',title:'',text:''}},fields:[{type:'select',k:'icon',l:'Icon',options:ICONS},{k:'title',l:'Title'},{type:'area',k:'text',l:'Text',rows:2}]}]},
    {type:'group',l:'Appointment block, team block and offers block',k:'home',fields:[{type:'row',fields:[{k:'apptEyebrow',l:'Appointment: small label'},{k:'apptTitle',l:'Appointment: title'}]},{k:'apptSub',l:'Appointment: sentence'},{type:'row',fields:[{k:'teamEyebrow',l:'Team: small label'},{k:'teamTitle',l:'Team: title'}]},{k:'teamBtn',l:'Team: button text'},{type:'row',fields:[{k:'popularEyebrow',l:'Popular treatments: small label'},{k:'popularTitle',l:'Popular treatments: title'}]},{type:'row',fields:[{k:'offersEyebrow',l:'Offers: small label'},{k:'offersTitle',l:'Offers: title'}]},{k:'offersSub',l:'Offers: sentence'}]}],
  areas:[{type:'note',text:'Each service area has its own page and appears in the menu. Treatments listed here show on the area page and in the booking form. To give a treatment its own detailed page, create one under Treatment pages using exactly the same name.'},
    {type:'list',k:'areas',l:'Service areas',noun:'Area',openFirst:false,title:function(o){return o.title},addLabel:'Add a service area',
      make:function(){return {key:'',title:'',art:'flower',blurb:'',intro:'',photo:'',focus:'center',groups:[{name:'',items:[]}]}},
      fields:[{k:'title',l:'Area name',onInput:function(o,inp){if(!o.key||o.key===slugify(o._prev||'')||o._autoKey){o.key=slugify(inp.value);o._autoKey=true;var k=inp.closest('.body').querySelector('[data-k=key]');if(k)k.value=o.key}}},
        {k:'key',l:'Web address name',hint:'Lowercase letters, numbers and dashes. It becomes the page address (#services-this-name). Avoid changing it after the site is live.',onInput:function(o){o._autoKey=false}},
        {type:'area',k:'blurb',l:'Short description (shown on the card)',rows:2},{type:'area',k:'intro',l:'Introduction (shown on the area page)',rows:3},
        img('photo','Photo'),focus(),{type:'select',k:'art',l:'Placeholder icon (used only when there is no photo)',options:ARTS},
        {type:'list',k:'groups',l:'Treatment lists',noun:'Group',openFirst:true,title:function(g){return g.name||'Treatments'},addLabel:'Add a group',hint:'Use one group, or several (for example Face, Body, Breast). The group name is hidden when there is only one group.',make:function(){return {name:'',items:[]}},
          fields:[{k:'name',l:'Group name'},{type:'strings',k:'items',l:'Treatments',add:'Add a treatment'}]}]}],
  treatments:[{type:'note',text:'A treatment page is a detailed page for one treatment, good for Google. Its name must match the treatment name in Services & treatments so the link appears there. In the text paragraphs you can write **bold** and [link text](#services-face).'},
    {type:'list',k:'treatments',l:'Treatment pages',noun:'Page',title:function(o){return o.name},addLabel:'Add a treatment page',openFirst:false,
      make:function(){return {slug:'',name:'',area:(D.areas[0]||{}).key||'',seoTitle:'',seoDesc:'',pageTitle:'',heroPhoto:'',heroFocus:'center',heading:'',paragraphs:[''],stepsTitle:'What happens in a session',steps:[],stepsNote:'',photoB:'',photoC:'',suitTitle:'Who it may suit',suit:[],risksTitle:'Risks and limitations',risks:[],risksNote:'',prepTitle:'Preparation and aftercare',prep:[],faqTitle:'Questions',faqs:[],ctaTitle:'',ctaText:'Tell us what you would like to discuss and our team will contact you about availability.',relatedTitle:'Related treatments',related:[],reviewedBy:'',reviewedOn:''}},
      fields:[{k:'name',l:'Treatment name',hint:'Exactly as it appears in the treatment list.',suggest:allTreatmentNames,onInput:function(o,inp){if(!o.slug||o._autoSlug){o.slug=slugify(inp.value);o._autoSlug=true;var k=inp.closest('.body').querySelector('[data-k=slug]');if(k)k.value=o.slug}}},
        {type:'row',fields:[{k:'slug',l:'Web address name',hint:'Lowercase letters, numbers and dashes.',onInput:function(o){o._autoSlug=false}},{type:'select',k:'area',l:'Belongs to service area',options:areaOptions}]},
        {k:'pageTitle',l:'Page heading at the top',ph:'e.g. Hydra Facial in Dubai',hint:'Leave blank to use the treatment name plus “in Dubai”.'},
        {k:'seoTitle',l:'Google title',hint:'Appears in the browser tab and search results. Include the treatment, Dubai and the clinic name.'},
        {type:'area',k:'seoDesc',l:'Google description',rows:2,hint:'About 150 characters.'},
        img('heroPhoto','Main photo'),focus('heroFocus'),
        {k:'heading',l:'Heading above the text',hint:'Leave blank to use the treatment name.'},
        {type:'strings',k:'paragraphs',l:'Opening paragraphs',add:'Add a paragraph',hint:'Use **bold** and [text](#link) if needed.'},
        {k:'stepsTitle',l:'Steps heading'},
        {type:'list',k:'steps',l:'Steps',noun:'Step',title:function(o){return o.title},addLabel:'Add a step',make:function(){return {title:'',text:''}},fields:[{k:'title',l:'Step title'},{type:'area',k:'text',l:'What happens',rows:2}]},
        {k:'stepsNote',l:'Note under the steps'},
        {type:'row',fields:[img('photoB','Second photo (optional)'),img('photoC','Third photo (optional)')]},
        {k:'suitTitle',l:'“Who it may suit” heading'},{type:'strings',k:'suit',l:'Who it may suit',add:'Add a point'},
        {k:'risksTitle',l:'Risks heading'},{type:'strings',k:'risks',l:'Risks and limitations',add:'Add a point'},{k:'risksNote',l:'Note under the risks'},
        {k:'prepTitle',l:'Preparation heading'},{type:'strings',k:'prep',l:'Preparation and aftercare',add:'Add a point'},
        {k:'faqTitle',l:'Questions heading'},
        {type:'list',k:'faqs',l:'Questions and answers',noun:'Question',title:function(o){return o.q},addLabel:'Add a question',make:function(){return {q:'',a:''}},hint:'These also help Google show your page as an answer.',fields:[{k:'q',l:'Question'},{type:'area',k:'a',l:'Answer',rows:3}]},
        {k:'ctaTitle',l:'Booking box title',hint:'Leave blank for “Ready to talk about …?”.'},{type:'area',k:'ctaText',l:'Booking box text',rows:2},
        {k:'relatedTitle',l:'Side box heading'},{type:'strings',k:'related',l:'Related treatments shown on the side',add:'Add a treatment',hint:'Type treatment names exactly as listed.'},
        {type:'row',fields:[{k:'reviewedBy',l:'Clinically reviewed by (optional)'},{k:'reviewedOn',l:'Review date (optional)'}]}]}],
  featured:[{type:'note',text:'The tall photo cards on the home page. If the name matches a treatment page, the card links to it.'},
    {type:'list',k:'featured',l:'Popular treatments',noun:'Treatment',title:function(o){return o.name},addLabel:'Add a treatment',make:function(){return {name:'',label:'',photo:'',focus:'center'}},
      fields:[{k:'name',l:'Treatment name',suggest:allTreatmentNames},{k:'label',l:'Small label (e.g. Face)'},img('photo','Photo','A portrait photo works best.'),focus()]}],
  offers:[{type:'note',text:'If you add no offers, visitors see a polite “no offers right now” message with a contact button.'},
    {type:'list',k:'offers',l:'Current offers',noun:'Offer',title:function(o){return o.title},addLabel:'Add an offer',make:function(){return {title:'',text:'',tag:'Offer',featured:false}},empty:'No offers yet.',
      fields:[{k:'title',l:'Offer title'},{type:'area',k:'text',l:'Details',rows:3,hint:'What it covers and the dates it runs.'},{k:'tag',l:'Small tag',ph:'Offer, Limited time…'},{type:'bool',k:'featured',l:'Show as the highlighted (dark) offer'}]},
    {k:'offersEmpty',l:'Message shown when there are no offers'},{k:'offerBtn',l:'Offer button text'}],
  reviews:[{type:'note',text:'Reviews are fetched automatically from Google (see the panel above) and you can also add reviews by hand. Reviews added by hand are never changed or removed by the refresh. The “Google review” label appears under each one.'},
    {type:'group',l:'Summary line',k:'reviews',fields:[{type:'row',fields:[{k:'rating',l:'Average rating',ph:'4.9'},{k:'count',l:'Number of Google reviews',ph:'250'}]},{k:'link',l:'Link to your Google reviews page',ph:'https://…'},{k:'linkText',l:'Button text'},{type:'row',fields:[{k:'eyebrow',l:'Small label'},{k:'title',l:'Title'}]}]},
    {type:'list',k:'reviews.items',l:'5-star reviews',noun:'Review',title:function(o){return (o.name||'New review')+(o.date?' — '+o.date:'')+(o.hidden?' (hidden)':'')+(o.src==='google'?' · from Google':'')},addLabel:'Add a review',make:function(){return {name:'',stars:5,date:'',text:''}},empty:'No reviews yet. The section stays hidden on the website until you add one.',
      fields:[{type:'row',fields:[{k:'name',l:'Reviewer name'},{k:'date',l:'Date',ph:'e.g. 2 weeks ago, or March 2026'}]},{type:'select',k:'stars',l:'Stars',num:true,options:[[5,'5'],[4,'4'],[3,'3']]},{type:'area',k:'text',l:'Review text',rows:4},{type:'bool',k:'hidden',l:'Hide this review on the website',hint:'Reviews fetched from Google are replaced on every refresh. Hiding one keeps it hidden.'}]}],
  team:[{type:'list',k:'team',l:'Specialists',noun:'Specialist',title:function(o){return o.name},addLabel:'Add a specialist',make:function(){return {name:'',role:'',bio:'',photo:''}},fields:person()},
    {type:'group',l:'Specialists page heading',k:'specialistsPage',fields:[{k:'eyebrow',l:'Small label'},{k:'title',l:'Title'}]}],
  directors:[{type:'list',k:'directors',l:'Directors',noun:'Director',title:function(o){return o.name},addLabel:'Add a director',make:function(){return {name:'',role:'',bio:'',photo:''}},fields:person()}],
  about:[{type:'group',l:'About page',k:'about',fields:[{k:'eyebrow',l:'Small label'},{k:'title',l:'Title'},{type:'area',k:'lead',l:'Main paragraph',rows:3},{type:'area',k:'text',l:'Second paragraph',rows:3,hint:'Good places for the clinic story, founding year and licences.'},img('photo','Photo'),focus()]}],
  tourism:[{type:'group',l:'Medical tourism',k:'tourism',fields:[
      {type:'row',fields:[{k:'cardTitle',l:'Name in menus and cards'},{k:'pageTitle',l:'Page title'}]},{k:'cardCount',l:'Card line (e.g. For patients travelling in)'},{type:'area',k:'cardText',l:'Card description',rows:2},
      {type:'row',fields:[{k:'eyebrow',l:'Small label'},{k:'heading',l:'Heading'}]},{type:'area',k:'text',l:'Intro paragraph',rows:3},{type:'row',fields:[{k:'btn1',l:'Main button'},{k:'btn2',l:'Second button'}]},
      img('photo','Photo'),focus(),
      {type:'list',k:'steps',l:'How it works',noun:'Step',title:function(o){return o.title},addLabel:'Add a step',make:function(){return {title:'',text:''}},fields:[{k:'title',l:'Title'},{type:'area',k:'text',l:'Text',rows:2}]},
      {type:'area',k:'note',l:'Extra note (optional)',rows:2,hint:'For example packages, airport transfers or languages spoken.'}]}],
  gallery:[{type:'group',l:'Before and after',k:'gallery',fields:[{type:'row',fields:[{k:'resultsEyebrow',l:'Small label'},{k:'resultsTitle',l:'Title'}]},{k:'resultsSub',l:'Sentence',hint:'Only show results patients have agreed to.'},
      {type:'list',k:'pairs',l:'Before and after sets',noun:'Set',title:function(o){return o.title},addLabel:'Add a set',make:function(){return {title:'',before:'',after:''}},hint:'A set only appears on the website once it has a before or after photo.',fields:[{k:'title',l:'Title (e.g. Laser treatment)'},{type:'row',fields:[img('before','Before photo'),img('after','After photo')]}]}]},
    {type:'group',l:'Clinic photos',k:'gallery',fields:[{type:'row',fields:[{k:'clinicEyebrow',l:'Small label'},{k:'clinicTitle',l:'Title'}]},
      {type:'list',k:'tiles',l:'Photos',noun:'Photo',title:function(o){return o.caption},addLabel:'Add a photo',make:function(){return {photo:'',caption:''}},fields:[img('photo','Photo'),{k:'caption',l:'Caption (also used as the description for screen readers)'}]}]}]
};

/* the offers and reviews sections need a few top-level keys outside their lists: handled by renderPath */
function renderSection(id,into){
  var defs=SCHEMA[id];
  /* list keys such as 'reviews.items' reach into nested objects */
  defs.forEach(function(d){
    if(d.type==='list'&&d.k.indexOf('.')>0){
      var parts=d.k.split('.'),host=D;for(var i=0;i<parts.length-1;i++)host=host[parts[i]];
      var nd={};for(var k in d)nd[k]=d[k];nd.k=parts[parts.length-1];
      into.appendChild(fList(nd,host));
    }else if(d.type==='group'&&d.k==='_root'){
      /* nothing */
    }else{
      var tmp=h('div');renderFields([d],D,tmp);while(tmp.firstChild)into.appendChild(tmp.firstChild);
    }
  });
}

/* ---------- media ---------- */
function loadMedia(force){
  if(mediaCache&&!force)return Promise.resolve(mediaCache);
  return api('media').then(function(j){mediaCache=j.items||[];return mediaCache});
}
function upload(file){
  var fd=new FormData();fd.append('file',file);
  return api('upload',{form:fd}).then(function(j){if(!j.ok)throw new Error(j.error||'Upload failed');mediaCache=null;return j.path});
}
function openPicker(done){
  var bg=h('div',{class:'modal-bg',onclick:function(e){if(e.target===bg)bg.remove()}}),grid=h('div',{class:'media'}),fi=h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/gif',hidden:true});
  var m=h('div',{class:'modal',role:'dialog','aria-modal':'true','aria-label':'Choose an image'},
    h('div',{class:'row'},h('h2',{text:'Choose an image',style:null}),h('span',{style:'flex:1'}),h('button',{class:'btn primary sm',type:'button',text:'Upload a new image',onclick:function(){fi.click()}}),h('button',{class:'btn sm',type:'button',text:'Close',onclick:function(){bg.remove()}})),
    h('p',{class:'hint',text:'JPG, PNG, WebP or GIF, up to 8 MB. Large photos are resized automatically.'}),grid,fi);
  bg.appendChild(m);document.body.appendChild(bg);
  function draw(items){
    clear(grid);
    items.forEach(function(it){
      var f=h('figure',{class:'pick',tabindex:'0',role:'button','aria-label':'Use '+it.name,onclick:function(){bg.remove();done(it.path)},onkeydown:function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();bg.remove();done(it.path)}}},h('img',{src:imgSrc(it.path),alt:'',loading:'lazy'}),h('figcaption',{text:it.name}));
      grid.appendChild(f);
    });
    if(!items.length)grid.appendChild(h('p',{class:'hint',text:'No images yet.'}));
  }
  loadMedia(true).then(draw);
  fi.addEventListener('change',function(){
    if(!fi.files[0])return;
    upload(fi.files[0]).then(function(p){bg.remove();done(p);toast('Image uploaded')}).catch(function(e){toast(e.message,true)});
  });
  var first=m.querySelector('button');if(first)first.focus();
  bg.addEventListener('keydown',function(e){if(e.key==='Escape')bg.remove()});
}

/* ---------- special screens ---------- */
function todoItems(){
  var T=[];
  function add(done,text,go){T.push({done:done,text:text,go:go})}
  var spec=D.team.filter(function(t){return !t.role||!t.photo});
  add(!spec.length,spec.length?spec.length+' of '+D.team.length+' specialists still need a role or portrait photo.':'All specialists have a role and photo.','team');
  var dir=D.directors.filter(function(t){return !t.bio||!t.photo});
  add(!dir.length,dir.length?'Add a biography and portrait for the director.':'Directors are complete.','directors');
  add((D.reviews.items||[]).length>0,(D.reviews.items||[]).length?'Google reviews are showing on the home page.':'Add your Google reviews so the “What our patients say” section appears.','reviews');
  add((D.offers||[]).length>0,(D.offers||[]).length?'Offers are published.':'No offers yet. Visitors see a “no offers right now” message.','offers');
  var ba=(D.gallery.pairs||[]).filter(function(p){return p.before||p.after});
  add(ba.length>0,ba.length?'Before and after photos are published.':'Add before and after photos (only with patient consent).','gallery');
  add(!!D.about.text,D.about.text?'About page has a story.':'Write the clinic story on the About page.','about');
  add(!!D.tourism.note,D.tourism.note?'Medical tourism details added.':'Add medical tourism details such as packages, transfers and languages.','tourism');
  add(!!D.reviews.link,D.reviews.link?'Google reviews link is set.':'Add the link to your Google reviews page.','reviews');
  return T;
}
function viewDashboard(into){
  var nT=0;D.areas.forEach(function(a){a.groups.forEach(function(g){nT+=g.items.length})});
  into.appendChild(h('h1',{text:'Welcome'}));
  into.appendChild(h('p',{class:'lede',text:'Choose a section on the left, edit, then press Save changes. Your changes go live on the website straight away.'}));
  into.appendChild(h('div',{class:'panel'},h('h2',{text:'Your website'}),h('div',{class:'stat'},
    h('div',null,h('b',{text:String(D.areas.length)}),'service areas'),h('div',null,h('b',{text:String(nT)}),'treatments listed'),h('div',null,h('b',{text:String(D.treatments.length)}),'treatment pages'),h('div',null,h('b',{text:String(D.team.length)}),'specialists'),h('div',null,h('b',{text:String((D.reviews.items||[]).length)}),'reviews shown')),
    h('div',{class:'row'},h('a',{class:'btn',href:'../',target:'_blank',rel:'noopener',text:'Open the website'}))));
  var ul=h('ul',{class:'todo'});
  todoItems().forEach(function(t){ul.appendChild(h('li',null,h('span',{class:'dot '+(t.done?'done':'open'),'aria-hidden':'true',text:t.done?'✓':'!'}),h('span',{text:t.text}),t.done?null:h('button',{type:'button',text:'Fix this',onclick:function(){go(t.go)}})))});
  into.appendChild(h('div',{class:'panel'},h('h2',{text:'To finish'}),ul));
  into.appendChild(h('div',{class:'panel'},h('h2',{text:'Good to know'}),h('ul',{class:'hint',style:'margin:0;padding-left:18px;display:grid;gap:6px'},
    h('li',{text:'Every save keeps a backup. If something goes wrong, open Backups and restore an earlier version.'}),
    h('li',{text:'Changes appear for visitors right after you press Save. If you do not see them, refresh the website page once.'}),
    h('li',{text:'Photos you upload are resized automatically. Use clear, well-lit photos.'}))));
}
function viewMedia(into){
  into.appendChild(h('h1',{text:'Image library'}));
  into.appendChild(h('p',{class:'lede',text:'Every photo available to the website. Upload new ones here, or while choosing a photo in any section.'}));
  var grid=h('div',{class:'media'}),fi=h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/gif',hidden:true});
  var panel=h('div',{class:'panel'},h('div',{class:'row'},h('button',{class:'btn primary',type:'button',text:'Upload an image',onclick:function(){fi.click()}}),fi),grid);
  into.appendChild(panel);
  function draw(){
    loadMedia(true).then(function(items){
      clear(grid);
      items.forEach(function(it){
        var cap=h('figcaption',null,h('span',{text:it.name}),it.deletable?h('button',{class:'btn sm danger',type:'button',text:'Delete',onclick:function(){
          if(!confirm('Delete '+it.name+'?'))return;
          api('delete_media',{body:{path:it.path}}).then(function(j){if(j.ok){toast('Deleted');draw()}else toast(j.error||'Could not delete',true)});
        }}):h('span',{class:'hint',text:'Part of the site'}));
        grid.appendChild(h('figure',null,h('img',{src:imgSrc(it.path),alt:'',loading:'lazy'}),cap));
      });
    });
  }
  draw();
  fi.addEventListener('change',function(){if(!fi.files[0])return;upload(fi.files[0]).then(function(){toast('Image uploaded');fi.value='';draw()}).catch(function(e){toast(e.message,true)})});
}

function renderGoogle(into){
  var panel=h('div',{class:'panel'},h('h2',{text:'Automatic Google reviews'}));
  into.appendChild(panel);
  var status=h('p',{class:'hint',text:'Loading…'});panel.appendChild(status);
  api('g_status').then(function(j){
    if(!j.ok){status.textContent=j.error||'Could not load.';return}
    var when=j.lastFetch?new Date(j.lastFetch*1000).toLocaleString():'never';
    status.textContent='Last refresh: '+when+(j.lastFetch?' ('+j.lastCount+' five-star reviews found)':'')+'.'+(j.lastError?' Last problem: '+j.lastError:'');
    var key=h('input',{id:'gk',type:'password',autocomplete:'off',placeholder:j.hasKey?'A key is saved. Type here only to replace it.':'Paste your Google API key'});
    var pid=h('input',{id:'gp',value:j.placeId||'',placeholder:'Starts with ChIJ…'});
    var q=h('input',{id:'gq',value:(D.site&&D.site.name)||'',placeholder:'Business name and area'});
    var results=h('div',{class:'items'});
    var ms=h('select',{id:'gm'});[[5,'5 stars only'],[4,'4 stars and above']].forEach(function(o){ms.appendChild(h('option',{value:o[0],text:o[1],selected:+j.minStars===o[0]?true:null}))});
    var msg=h('div',{class:'msg',role:'status'});msg.hidden=true;
    function say(t,err){msg.className='msg'+(err?' err':'');msg.textContent=t;msg.hidden=false}
    function saveCfg(){return api('g_save',{body:{key:key.value.trim(),placeId:pid.value.trim(),minStars:+ms.value}}).then(function(r){if(!r.ok)throw new Error(r.error||'Could not save');key.value='';return r})}
    panel.appendChild(msg);
    panel.appendChild(h('div',{class:'field'},h('label',{for:'gk',text:'Google API key'}),key,h('div',{class:'hint',text:'Kept on your server only. It is never shown on the website or sent to visitors.'})));
    panel.appendChild(h('div',{class:'field'},h('label',{for:'gq',text:'Find your business'}),h('div',{class:'srow'},q,h('button',{class:'btn sm',type:'button',text:'Search',onclick:function(){
      clear(results);say('Searching…');
      saveCfg().then(function(){return api('g_find',{body:{query:q.value}})}).then(function(r){
        if(!r.ok)throw new Error(r.error||'Search failed');msg.hidden=true;
        if(!r.places.length)results.appendChild(h('p',{class:'hint',text:'No matches. Try the name with the area, e.g. “Bloom Aesthetic and Laser Clinic Umm Suqeim”.'}));
        r.places.forEach(function(p){results.appendChild(h('button',{class:'btn',type:'button',text:p.name+' — '+p.address,onclick:function(){pid.value=p.id;clear(results);say('Selected. Press Save settings.')}}))});
      }).catch(function(e){say(e.message,true)});
    }})),results));
    panel.appendChild(h('div',{class:'field'},h('label',{for:'gp',text:'Place ID'}),pid,h('div',{class:'hint',text:'Filled in for you when you pick your business above.'})));
    panel.appendChild(h('div',{class:'field'},h('label',{for:'gm',text:'Which reviews to show'}),ms));
    panel.appendChild(h('div',{class:'row'},
      h('button',{class:'btn',type:'button',text:'Save settings',onclick:function(){saveCfg().then(function(){say('Settings saved.');return api('g_status')}).then(function(){}).catch(function(e){say(e.message,true)})}}),
      h('button',{class:'btn primary',type:'button',text:'Fetch reviews now',onclick:function(){
        if(isDirty()){say('Save your other changes first (Save changes at the top), then fetch.',true);return}
        say('Fetching from Google…');
        saveCfg().then(function(){return api('g_fetch',{body:{}})}).then(function(r){
          if(!r.ok)throw new Error(r.error||'Fetch failed');
          toast('Fetched '+r.added+' reviews. Rating '+r.rating+' from '+r.count+' reviews.');loadContent();
        }).catch(function(e){say(e.message,true)});
      }})));
    panel.appendChild(h('details',{class:'item'},h('summary',null,h('span',{class:'t',text:'How to get a Google API key (about 10 minutes)'})),h('div',{class:'body'},
      h('ol',{class:'hint',style:'margin:0;padding-left:20px;display:grid;gap:6px'},
        h('li',{text:'Go to console.cloud.google.com and sign in with the Google account for your business.'}),
        h('li',{text:'Create a project (any name) and add a billing account. Google gives a monthly free credit, and one refresh a day costs very little or nothing.'}),
        h('li',{text:'Open “APIs & Services” → “Library”, search for “Places API (New)” and click Enable.'}),
        h('li',{text:'Open “APIs & Services” → “Credentials” → “Create credentials” → “API key”.'}),
        h('li',{text:'Edit the key: under “API restrictions” choose “Places API (New)”. If your host has a fixed IP address, add it under “Application restrictions”.'}),
        h('li',{text:'Paste the key above, search for your business, pick it, press Save settings and then Fetch reviews now.'})),
      h('p',{class:'hint',text:'Daily refresh: in cPanel → Cron Jobs, add once a day: /usr/local/bin/php /home/YOURUSER/public_html/admin/cron-reviews.php (use your real folder). Google returns at most 5 reviews per fetch.'}))));
  });
}
function viewBackups(into){
  into.appendChild(h('h1',{text:'Backups'}));
  into.appendChild(h('p',{class:'lede',text:'A copy of the website content is kept every time you save (the latest 40). Restoring replaces what is on the website now, and also keeps a copy of it.'}));
  var panel=h('div',{class:'panel'});into.appendChild(panel);
  api('backups').then(function(j){
    if(!(j.items||[]).length){panel.appendChild(h('p',{text:'No backups yet. The first one is created when you save.'}));return}
    var tb=h('tbody');
    j.items.forEach(function(b){
      tb.appendChild(h('tr',null,h('td',{text:new Date(b.time*1000).toLocaleString()}),h('td',{text:Math.round(b.size/1024)+' KB'}),h('td',null,h('button',{class:'btn sm',type:'button',text:'Restore',onclick:function(){
        if(isDirty()&&!confirm('You have unsaved changes that will be lost. Continue?'))return;
        if(!confirm('Restore the version from '+new Date(b.time*1000).toLocaleString()+'?'))return;
        api('restore',{body:{name:b.name}}).then(function(r){if(r.ok){toast('Restored');loadContent()}else toast(r.error||'Could not restore',true)});
      }}))));
    });
    panel.appendChild(h('table',{class:'bk'},h('thead',null,h('tr',null,h('th',{text:'Saved'}),h('th',{text:'Size'}),h('th',{text:''}))),tb));
  });
}
function viewAccount(into){
  into.appendChild(h('h1',{text:'Account'}));
  var cu=h('input',{id:'ac',type:'password',autocomplete:'current-password'}),un=h('input',{id:'au',autocomplete:'username',value:'admin'}),n1=h('input',{id:'an',type:'password',autocomplete:'new-password'}),n2=h('input',{id:'an2',type:'password',autocomplete:'new-password'});
  var msg=h('div',{class:'msg',role:'status'});msg.hidden=true;
  into.appendChild(h('form',{class:'panel',onsubmit:function(e){
    e.preventDefault();msg.hidden=true;
    if(n1.value!==n2.value){msg.className='msg err';msg.textContent='The two new passwords do not match.';msg.hidden=false;return}
    api('password',{body:{current:cu.value,new:n1.value,user:un.value.trim()}}).then(function(j){
      msg.className='msg'+(j.ok?'':' err');msg.textContent=j.ok?'Password updated.':(j.error||'Could not update.');msg.hidden=false;if(j.ok){cu.value=n1.value=n2.value=''}
    });
  }},h('h2',{text:'Change username or password'}),msg,
    h('div',{class:'field'},h('label',{for:'au',text:'Username'}),un),h('div',{class:'field'},h('label',{for:'ac',text:'Current password'}),cu),
    h('div',{class:'field'},h('label',{for:'an',text:'New password (at least 10 characters)'}),n1),h('div',{class:'field'},h('label',{for:'an2',text:'Repeat new password'}),n2),
    h('div',null,h('button',{class:'btn primary',type:'submit',text:'Update'}))));
}

/* ---------- shell ---------- */
var NAVS=[['dashboard','Overview'],['_','Pages'],['home','Home page'],['areas','Services & treatments'],['treatments','Treatment pages'],['featured','Popular treatments'],['offers','Promotions'],['reviews','Google reviews'],['team','Specialists'],['directors','Directors'],['about','About page'],['tourism','Medical tourism'],['gallery','Gallery'],['_','Clinic'],['site','Contact & hours'],['_','Tools'],['media','Image library'],['backups','Backups'],['account','Account']];
var TITLES={dashboard:'Overview',home:'Home page',areas:'Services & treatments',treatments:'Treatment pages',featured:'Popular treatments',offers:'Promotions',reviews:'Google reviews',team:'Specialists',directors:'Directors',about:'About page',tourism:'Medical tourism',gallery:'Gallery',site:'Contact & hours',media:'Image library',backups:'Backups',account:'Account'};
var LEDES={home:'The wording and photos on the home page.',areas:'The five service areas and every treatment listed in them.',treatments:'Detailed pages for individual treatments.',featured:'Popular treatments shown as photo cards on the home page.',offers:'Offers shown on the Promotions page and the bottom of the home page.',reviews:'The “What our patients say” section on the home page.',team:'Specialists shown on the home page and the Specialists page.',directors:'The Our Directors page.',about:'The About Bloom page.',tourism:'The Medical Tourism page and its card.',gallery:'Before and after results and clinic photos.',site:'Phone, email, address and opening hours. They update everywhere on the site.'};
function go(id){if(cur===id)return;cur=id;shell()}
function shell(){
  clear(app);
  var side=h('aside',{class:'side',id:'side'},h('a',{class:'brand',href:'../',target:'_blank',rel:'noopener','aria-label':'Open the website'},h('img',{src:'../images/bloom-logo-horizontal.png',alt:'Bloom Clinic'})),h('nav',{'aria-label':'Admin sections'}));
  var nav=side.querySelector('nav');
  NAVS.forEach(function(n){
    if(n[0]==='_')nav.appendChild(h('div',{class:'sep',text:n[1]}));
    else nav.appendChild(h('button',{class:'nav',type:'button','aria-current':n[0]===cur?'page':null,text:n[1],onclick:function(){side.classList.remove('open');go(n[0])}}));
  });
  var save=h('button',{class:'btn primary',id:'savebtn',type:'button',disabled:true,text:'Save changes',onclick:doSave});
  var top=h('div',{class:'top'},h('button',{class:'btn menu',type:'button',text:'Menu','aria-label':'Open menu',onclick:function(){side.classList.toggle('open')}}),h('div',{class:'title'},TITLES[cur]||''),h('span',{id:'dirty',class:'dirty',text:'All changes saved'}),save,
    h('a',{class:'btn',href:'../',target:'_blank',rel:'noopener',text:'View site'}),h('button',{class:'btn',type:'button',text:'Sign out',onclick:function(){if(isDirty()&&!confirm('You have unsaved changes. Sign out anyway?'))return;api('logout',{body:{}}).then(function(){D=null;boot()})}}));
  var content=h('div',{class:'content',id:'content'});
  var main=h('main',{class:'main'},top,content);
  app.appendChild(h('div',{class:'shell'},side,main));
  if(cur==='dashboard')viewDashboard(content);
  else if(cur==='media')viewMedia(content);
  else if(cur==='backups')viewBackups(content);
  else if(cur==='account')viewAccount(content);
  else if(SCHEMA[cur]){
    content.appendChild(h('h1',{text:TITLES[cur]}));
    content.appendChild(h('p',{class:'lede',text:LEDES[cur]||''}));
    if(cur==='reviews')renderGoogle(content);
    var panel=h('div',{class:'panel'});content.appendChild(panel);
    renderSection(cur,panel);
    var btm=h('div',{class:'row'},h('button',{class:'btn primary',type:'button',text:'Save changes',onclick:doSave}));
    content.appendChild(btm);
  }
  touch();
  window.scrollTo(0,0);
}

function doSave(force){
  var err=localCheck();
  if(err)return toast(err,true);
  var b=document.getElementById('savebtn');if(b){b.disabled=true;b.textContent='Saving…'}
  var payload=JSON.parse(JSON.stringify(D,function(k,v){return k[0]==='_'?undefined:v}));
  api('save',{body:{content:payload,mtime:mtime,force:force===true}}).then(function(j){
    if(b)b.textContent='Save changes';
    if(j.ok){D=JSON.parse(JSON.stringify(payload));saved=JSON.stringify(D);mtime=j.mtime;touch();toast('Saved. Your website is updated.')}
    else if(j.conflict){if(confirm(j.error+'\n\nPress OK to overwrite with your version, or Cancel to keep editing (then reload to see the other changes).'))doSave(true);else touch()}
    else if(j._status===401){toast('You were signed out. Sign in again; your edits on this page are kept until you reload.',true);loginView('Please sign in again.')}
    else{toast(j.error||'Could not save.',true);touch()}
  }).catch(function(){if(b)b.textContent='Save changes';toast('Could not reach the server.',true);touch()});
}
function localCheck(){
  var re=/^[a-z0-9][a-z0-9-]*$/,seen={};
  for(var i=0;i<D.areas.length;i++){var a=D.areas[i];if(!a.title)return 'Service area '+(i+1)+' needs a name.';if(!re.test(a.key||''))return 'Service area "'+a.title+'" needs a web address name (lowercase letters, numbers, dashes).';if(seen['a'+a.key])return 'Two service areas use the web address name "'+a.key+'".';seen['a'+a.key]=1}
  seen={};
  for(var j=0;j<D.treatments.length;j++){var t=D.treatments[j];if(!t.name)return 'Treatment page '+(j+1)+' needs a name.';if(!re.test(t.slug||''))return 'Treatment page "'+t.name+'" needs a web address name (lowercase letters, numbers, dashes).';if(seen[t.slug])return 'Two treatment pages use the web address name "'+t.slug+'".';seen[t.slug]=1}
  for(var k=0;k<(D.reviews.items||[]).length;k++){var r=D.reviews.items[k];if(!r.name||!r.text)return 'Review '+(k+1)+' needs a reviewer name and text (or delete it).'}
  return '';
}

boot();
})();
