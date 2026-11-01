import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Globe2, Leaf, Menu, Minus, Plus, ShoppingBag, Sparkles, X } from 'lucide-react';

const copy = {
  fr: {
    nav: ['Accueil','Notre huilerie','Nos huiles','Qualité','Services','Contact'],
    eyebrow:'L’OR VERT DE NOTRE TERROIR', heroTitle:'La nature,\nà l’état pur.', heroText:'Une histoire de terre, de patience et de passion. Découvrez l’univers Oro Verde et l’excellence de l’huile d’olive.',
    discover:'Découvrir nos huiles', story:'Notre histoire', since:'L’EXCELLENCE DE L’OLIVE', introTitle:'La richesse de la terre.\nLe savoir-faire du moulin.', introText:'De l’olivier à la bouteille, chaque étape compte. Oro Verde célèbre la générosité de l’olive et le soin apporté à sa transformation.', learn:'Découvrir notre huilerie',
    collection:'LA SÉLECTION ORO VERDE', productsTitle:'L’essence de l’olive', productsText:'Une sélection pensée autour du goût, de l’origine et du plaisir de partager.', details:'Découvrir', price:'Prix sur demande', add:'Ajouter au panier', all:'Toute la collection',
    quality:'NOTRE ENGAGEMENT', qualityTitle:'La qualité n’est pas un hasard.', qualityText:'Elle se construit à chaque étape : sélection des olives, maîtrise de l’extraction, attention portée à la conservation et transparence sur l’origine.', q1:'Soin de la récolte',q2:'Maîtrise de l’extraction',q3:'Attention à la qualité',
    services:'AU SERVICE DES OLÉICULTEURS', servicesTitle:'La passion de l’olive,\nau cœur de notre métier.', servicesText:'Découvrez nos services de trituration et l’accompagnement proposé aux producteurs.', contact:'Parlons de votre récolte',
    visit:'RENDEZ-NOUS VISITE', contactTitle:'L’huile d’olive est une histoire qui se partage.', contactText:'Une question sur nos huiles, nos services ou une commande ? Notre équipe sera heureuse de vous renseigner.', contactBtn:'Nous contacter',
    cart:'Votre panier', empty:'Votre panier est encore vide.', continue:'Continuer la découverte', subtotal:'Sous-total indicatif', checkout:'Préparer ma demande', remove:'Retirer', footer:'L’excellence de l’olive.', rights:'Tous droits réservés.', cartNote:'Les prix et la disponibilité seront confirmés lors de votre demande.',
    menu:'Menu', language:'Langue', orderTitle:'Votre demande', name:'Nom complet', phone:'Téléphone', city:'Ville / pays', note:'Votre message (facultatif)', send:'Préparer la demande', orderDisclaimer:'Le formulaire est une prévisualisation : aucun paiement ni commande n’est transmis pour le moment. Les coordonnées et le système de commande seront configurés avant l’ouverture officielle.',
    orderReady:'Votre demande est prête à être configurée.', country:'Pays de livraison', address:'Adresse complète', currency:'Devise d’affichage', payment:'Mode de paiement', cod:'Paiement à la livraison', electronic:'Paiement électronique (activation après configuration)', destination:'Choisissez votre pays', cartSummary:'Récapitulatif', close:'Fermer'
  },
  ar: {
    nav:['الرئيسية','معصرتنا','زيوتنا','الجودة','خدماتنا','اتصل بنا'],
    eyebrow:'ذهب أرضنا الأخضر', heroTitle:'طبيعة نقية،\nبكل تفاصيلها.', heroText:'حكاية أرض وصبر وشغف. اكتشف عالم Oro Verde وتميّز زيت الزيتون.',
    discover:'اكتشف زيوتنا', story:'قصتنا', since:'تميّز الزيتون', introTitle:'ثراء الأرض.\nوخبرة المعصرة.', introText:'من شجرة الزيتون إلى القارورة، لكل مرحلة أهميتها. نحتفي بكرم الزيتون والعناية بتحويله إلى زيت.', learn:'اكتشف معصرتنا',
    collection:'مختارات ORO VERDE', productsTitle:'خلاصة الزيتون', productsText:'مجموعة مختارة تحتفي بالمذاق والأصل ومتعة المشاركة.', details:'اكتشف', price:'السعر عند الطلب', add:'أضف إلى السلة', all:'كل المنتجات',
    quality:'التزامنا', qualityTitle:'الجودة ليست صدفة.', qualityText:'إنها ثمرة العناية في كل مرحلة: اختيار الزيتون، والتحكم في العصر، والمحافظة على الجودة والشفافية في المصدر.', q1:'العناية بالحصاد',q2:'إتقان عملية العصر',q3:'الاهتمام بالجودة',
    services:'في خدمة منتجي الزيتون', servicesTitle:'شغف الزيتون،\nجوهر عملنا.', servicesText:'اكتشف خدمات عصر الزيتون والمرافقة التي نقدمها للمنتجين.', contact:'لنتحدث عن محصولك',
    visit:'نرحب بزيارتكم', contactTitle:'زيت الزيتون حكاية نتقاسمها.', contactText:'هل لديك سؤال حول زيوتنا أو خدماتنا أو طلبية؟ يسعد فريقنا بمساعدتك.', contactBtn:'تواصل معنا',
    cart:'سلة المشتريات', empty:'سلتك فارغة حالياً.', continue:'واصل الاكتشاف', subtotal:'المجموع التقديري', checkout:'إعداد طلب', remove:'حذف', footer:'تميّز الزيتون.', rights:'جميع الحقوق محفوظة.', cartNote:'يتم تأكيد الأسعار والتوفر عند تقديم طلبك.',
    menu:'القائمة', language:'اللغة', orderTitle:'طلبك', name:'الاسم الكامل', phone:'رقم الهاتف', city:'المدينة / البلد', note:'رسالتك (اختياري)', send:'إعداد الطلب', orderDisclaimer:'هذه معاينة للنموذج فقط: لا يتم حالياً إرسال أي طلب أو تنفيذ أي دفع. سيتم إعداد بيانات الاتصال ونظام الطلبات قبل الإطلاق الرسمي.',
    orderReady:'طلبك جاهز للإعداد والربط.', country:'بلد التوصيل', address:'العنوان الكامل', currency:'العملة', payment:'طريقة الدفع', cod:'الدفع عند الاستلام', electronic:'الدفع الإلكتروني (يُفعّل بعد الإعداد)', destination:'اختر بلدك', cartSummary:'ملخص الطلب', close:'إغلاق'
  },
  en: {
    nav:['Home','Our mill','Our oils','Quality','Services','Contact'],
    eyebrow:'THE GREEN GOLD OF OUR LAND', heroTitle:'Nature,\nin its purest form.', heroText:'A story of land, patience and passion. Discover the world of Oro Verde and the excellence of olive oil.',
    discover:'Explore our oils', story:'Our story', since:'THE EXCELLENCE OF OLIVES', introTitle:'The richness of the land.\nThe craft of the mill.', introText:'From the olive tree to the bottle, every step matters. Oro Verde celebrates the generosity of the olive and the care behind its transformation.', learn:'Discover our mill',
    collection:'THE ORO VERDE SELECTION', productsTitle:'The essence of the olive', productsText:'A considered selection shaped by taste, origin and the joy of sharing.', details:'Discover', price:'Price on request', add:'Add to cart', all:'Explore the collection',
    quality:'OUR COMMITMENT', qualityTitle:'Quality is never an accident.', qualityText:'It is built at every step: olive selection, careful extraction, thoughtful storage and transparency about origin.', q1:'Careful harvesting',q2:'Expert extraction',q3:'Commitment to quality',
    services:'SERVING OLIVE GROWERS', servicesTitle:'A passion for olives,\nat the heart of what we do.', servicesText:'Discover our olive pressing services and the support we offer growers.', contact:'Let’s talk about your harvest',
    visit:'COME AND VISIT US', contactTitle:'Olive oil is a story worth sharing.', contactText:'Questions about our oils, services or an order? Our team will be happy to help.', contactBtn:'Get in touch',
    cart:'Your basket', empty:'Your basket is currently empty.', continue:'Continue exploring', subtotal:'Indicative subtotal', checkout:'Prepare my request', remove:'Remove', footer:'The excellence of olives.', rights:'All rights reserved.', cartNote:'Prices and availability will be confirmed with your enquiry.',
    menu:'Menu', language:'Language', orderTitle:'Your enquiry', name:'Full name', phone:'Phone', city:'City / country', note:'Your message (optional)', send:'Prepare enquiry', orderDisclaimer:'This is a preview form: no payment or order is submitted yet. Contact details and the order system will be configured before the official launch.',
    orderReady:'Your enquiry is ready to be connected.', country:'Shipping country', address:'Full address', currency:'Display currency', payment:'Payment method', cod:'Cash on delivery', electronic:'Online payment (available after setup)', destination:'Choose your country', cartSummary:'Order summary', close:'Close'
  }
};

const products = [
  {id:1, name:{fr:'Huile d’olive extra vierge',ar:'زيت زيتون بكر ممتاز',en:'Extra virgin olive oil'}, detail:{fr:'La signature Oro Verde',ar:'توقيع Oro Verde',en:'The Oro Verde signature'}, image:'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1000&q=85', tag:'01'},
  {id:2, name:{fr:'Sélection du moulin',ar:'مختارات المعصرة',en:'Mill selection'}, detail:{fr:'Le goût de notre terroir',ar:'مذاق أرضنا',en:'A taste of our land'}, image:'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1000&q=85', tag:'02'},
  {id:3, name:{fr:'Coffret découverte',ar:'علبة اكتشاف',en:'Discovery gift set'}, detail:{fr:'À offrir et à partager',ar:'هدية للمشاركة',en:'Made to be shared'}, image:'https://images.unsplash.com/photo-1603569283847-aa295f0d016a?auto=format&fit=crop&w=1000&q=85', tag:'03'}
];

function App(){
  const [lang,setLang]=useState('fr');
  const [cart,setCart]=useState({});
  const [cartOpen,setCartOpen]=useState(false);
  const [orderOpen,setOrderOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [form,setForm]=useState({name:'',phone:'',city:'',country:'',address:'',currency:'EUR',payment:'electronic',note:''});
  const [prepared,setPrepared]=useState(false);
  const t=copy[lang], rtl=lang==='ar';
  const count=Object.values(cart).reduce((a,b)=>a+b,0);
  const items=useMemo(()=>products.filter(p=>cart[p.id]).map(p=>({...p,qty:cart[p.id]})),[cart]);
  const setQty=(id,n)=>setCart(old=>{const next={...old}; if(n<=0) delete next[id]; else next[id]=n; return next;});
  const navTo=(id)=>{setMobileOpen(false);document.getElementById(id)?.scrollIntoView({behavior:'smooth'});};
  const submit=(e)=>{e.preventDefault();setPrepared(true);};\n  const isTunisia=form.country==='TN';
  return <div className={rtl?'site rtl':'site'} dir={rtl?'rtl':'ltr'}>
    <header className="header">
      <a className="brand" href="#home" onClick={()=>navTo('home')} aria-label="Oro Verde home"><span className="brand-mark"><Leaf size={23}/></span><span className="brand-name">ORO VERDE<small>OLIVE OIL · EST. WITH CARE</small></span></a>
      <nav className="desktop-nav">{t.nav.map((n,i)=><button key={n} onClick={()=>navTo(['home','mill','oils','quality','services','contact'][i])}>{n}</button>)}</nav>
      <div className="header-actions">
        <div className="language"><Globe2 size={16}/><select value={lang} onChange={e=>setLang(e.target.value)} aria-label={t.language}><option value="fr">FR</option><option value="ar">عربي</option><option value="en">EN</option></select><ChevronDown size={13}/></div>
        <button className="cart-trigger" onClick={()=>setCartOpen(true)} aria-label={t.cart}><ShoppingBag size={19}/><span>{count}</span></button>
        <button className="mobile-trigger" onClick={()=>setMobileOpen(!mobileOpen)} aria-label={t.menu}>{mobileOpen?<X/>:<Menu/>}</button>
      </div>
    </header>
    {mobileOpen&&<nav className="mobile-nav">{t.nav.map((n,i)=><button key={n} onClick={()=>navTo(['home','mill','oils','quality','services','contact'][i])}>{n}<ArrowUpRight size={16}/></button>)}</nav>}
    <main>
      <section className="hero" id="home">
        <div className="hero-image"></div><div className="hero-shade"></div>
        <div className="hero-content"><div className="eyebrow light"><span></span>{t.eyebrow}</div><h1>{t.heroTitle.split('\n').map((x,i)=><React.Fragment key={i}>{i>0&&<br/>}{x}</React.Fragment>)}</h1><p>{t.heroText}</p><div className="hero-buttons"><button className="button button-gold" onClick={()=>navTo('oils')}>{t.discover}<ArrowUpRight size={17}/></button><button className="text-link light-link" onClick={()=>navTo('mill')}>{t.story}<ArrowDown size={15}/></button></div></div>
        <div className="hero-caption"><span>36° N · MEDITERRANEAN</span><span>01 / 03</span></div>
        <div className="hero-side-note">PURE ORIGIN · TIMELESS CRAFT</div>
      </section>
      <section className="intro section-wrap" id="mill">
        <div className="intro-photo"><img src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85" alt="Paysage méditerranéen" /><div className="photo-stamp"><Leaf size={24}/><span>ORO<br/>VERDE</span></div></div>
        <div className="intro-copy"><div className="eyebrow"><span></span>{t.since}</div><h2>{t.introTitle.split('\n').map((x,i)=><React.Fragment key={i}>{i>0&&<br/>}{x}</React.Fragment>)}</h2><p>{t.introText}</p><button className="text-link" onClick={()=>navTo('services')}>{t.learn}<ArrowUpRight size={17}/></button><div className="intro-index">01 <i></i> 03</div></div>
      </section>
      <section className="products-section" id="oils"><div className="section-wrap"><div className="section-heading"><div><div className="eyebrow"><span></span>{t.collection}</div><h2>{t.productsTitle}</h2><p>{t.productsText}</p></div><button className="text-link" onClick={()=>setCartOpen(true)}>{t.all}<ArrowUpRight size={17}/></button></div><div className="product-grid">{products.map(p=><article className="product-card" key={p.id}><div className="product-image"><img src={p.image} alt={p.name[lang]}/><span className="product-number">{p.tag}</span><button className="quick-add" onClick={()=>setQty(p.id,(cart[p.id]||0)+1)} aria-label={t.add}><Plus size={19}/></button></div><div className="product-meta"><div><h3>{p.name[lang]}</h3><p>{p.detail[lang]}</p></div><span className="product-price">{t.price}</span></div><button className="product-add" onClick={()=>setQty(p.id,(cart[p.id]||0)+1)}>{t.add}<ArrowUpRight size={15}/></button></article>)}</div></div></section>
      <section className="quality-section" id="quality"><div className="quality-photo"></div><div className="quality-content"><div className="eyebrow light"><span></span>{t.quality}</div><h2>{t.qualityTitle}</h2><p>{t.qualityText}</p><div className="quality-points"><div><span>01</span>{t.q1}</div><div><span>02</span>{t.q2}</div><div><span>03</span>{t.q3}</div></div></div></section>
      <section className="services-section section-wrap" id="services"><div className="services-copy"><div className="eyebrow"><span></span>{t.services}</div><h2>{t.servicesTitle.split('\n').map((x,i)=><React.Fragment key={i}>{i>0&&<br/>}{x}</React.Fragment>)}</h2><p>{t.servicesText}</p><button className="button button-dark" onClick={()=>navTo('contact')}>{t.contact}<ArrowUpRight size={17}/></button></div><div className="services-image"><img src="https://images.unsplash.com/photo-1515586000433-45406d8e6662?auto=format&fit=crop&w=1200&q=85" alt="Récolte des olives"/></div></section>
      <section className="contact-band" id="contact"><div className="contact-inner"><div className="eyebrow light"><span></span>{t.visit}</div><h2>{t.contactTitle}</h2><p>{t.contactText}</p><a className="button button-gold" href="mailto:contact@oroverde.com">{t.contactBtn}<ArrowUpRight size={17}/></a><span className="contact-watermark">OV</span></div></section>
    </main>
    <footer className="footer"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Leaf size={21}/></span><span className="brand-name">ORO VERDE<small>OLIVE OIL · EST. WITH CARE</small></span></a><p>{t.footer}</p><span>© {new Date().getFullYear()} ORO VERDE. {t.rights}</span></footer>
    {cartOpen&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setCartOpen(false)}><aside className="drawer"><div className="drawer-head"><h2>{t.cart} <small>({count})</small></h2><button onClick={()=>setCartOpen(false)} aria-label="Close"><X/></button></div>{items.length===0?<div className="empty-cart"><ShoppingBag size={36}/><p>{t.empty}</p><button className="text-link" onClick={()=>setCartOpen(false)}>{t.continue}<ArrowUpRight size={16}/></button></div>:<><div className="cart-items">{items.map(p=><div className="cart-item" key={p.id}><img src={p.image} alt=""/><div className="cart-item-info"><h3>{p.name[lang]}</h3><small>{t.price}</small><div className="quantity"><button onClick={()=>setQty(p.id,p.qty-1)}><Minus size={13}/></button><span>{p.qty}</span><button onClick={()=>setQty(p.id,p.qty+1)}><Plus size={13}/></button></div><button className="remove-link" onClick={()=>setQty(p.id,0)}>{t.remove}</button></div></div>)}</div><div className="cart-bottom"><p>{t.cartNote}</p><button className="button button-dark full" onClick={()=>{setCartOpen(false);setOrderOpen(true);setPrepared(false)}}>{t.checkout}<ArrowUpRight size={17}/></button></div></>}</aside></div>}
    {orderOpen&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setOrderOpen(false)}><div className="order-modal"><div className="drawer-head"><h2>{t.orderTitle}</h2><button onClick={()=>setOrderOpen(false)}><X/></button></div>{prepared?<div className="prepared"><Check size={36}/><h3>{t.orderReady}</h3><p>{t.orderDisclaimer}</p><button className="button button-dark full" onClick={()=>setOrderOpen(false)}>{t.close}</button></div>:<form onSubmit={submit}>
  <div className="checkout-summary"><strong>{t.cartSummary}</strong>{items.map(p=><div key={p.id}><span>{p.name[lang]} × {p.qty}</span><small>{t.price}</small></div>)}</div>
  <label>{t.name}<input required autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
  <label>{t.phone}<input required autoComplete="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
  <label>{t.country}<select required value={form.country} onChange={e=>setForm({...form,country:e.target.value,payment:e.target.value==='TN'?'cod':'electronic'})}><option value="">{t.destination}</option><option value="TN">Tunisie / تونس</option><option value="CA">Canada</option><option value="FR">France</option><option value="DE">Deutschland</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="OTHER">Autre pays</option></select></label>
  <label>{t.address}<input required autoComplete="street-address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
  <label>{t.city}<input required autoComplete="address-level2" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
  <label>{t.currency}<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value="TND">TND — Dinar tunisien</option><option value="EUR">EUR — Euro</option><option value="CAD">CAD — Dollar canadien</option><option value="USD">USD — US Dollar</option><option value="GBP">GBP — Pound sterling</option></select></label>
  <label>{t.payment}<select value={form.payment} onChange={e=>setForm({...form,payment:e.target.value})}><option value="electronic">{t.electronic}</option>{isTunisia&&<option value="cod">{t.cod}</option>}</select></label>
  <label>{t.note}<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
  <p className="form-disclaimer">{t.orderDisclaimer}</p><button className="button button-dark full" type="submit">{t.send}<ArrowUpRight size={17}/></button></form>}</div></div>}
  </div>;
}
export default App;