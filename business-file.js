// My Business File: the client app. Runs live against Supabase when
// window.NBW_CONFIG has a project URL and key (business-file.html), and as a
// demo with an example client otherwise (business-file-demo.html).
// Team avatar: gold shield on navy, used instead of a personal photo.
const TEAM_AVATAR=`<span class="avatar team" aria-hidden="true"><svg viewBox="0 0 48 54"><path d="M24 3 44 10v15c0 13-8.6 22.4-20 26C12.6 47.4 4 38 4 25V10z" fill="none" stroke="#e3c594" stroke-width="3.6" stroke-linejoin="round"/><path d="M12 31l7-9 4 5 5-8 8 12z" fill="#e3c594"/><path d="M16 36l6 5 11-12" fill="none" stroke="#e3c594" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const DAY=864e5, TODAY=new Date(); TODAY.setHours(0,0,0,0);
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const inDays=n=>iso(new Date(TODAY.getTime()+n*DAY));
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// Transparent vector logo: gold shield, "NEVADA" in currentColor so it reads on navy or light backgrounds.
const LOGO=`<svg class="logo" viewBox="0 0 250 56" role="img" aria-label="Nevada Business Watch"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8cc8e"/><stop offset="1" stop-color="#b08a4a"/></linearGradient></defs>
<path d="M24 3 44 10v15c0 13-8.6 22.4-20 26C12.6 47.4 4 38 4 25V10z" fill="none" stroke="url(#lg)" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M12 31l7-9 4 5 5-8 8 12z" fill="url(#lg)"/><path d="M16 36l6 5 11-12" fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<text x="56" y="22" font-family="Plus Jakarta Sans,Segoe UI,sans-serif" font-size="13" font-weight="600" letter-spacing="2.5" fill="currentColor">NEVADA</text>
<text x="56" y="42" font-family="Plus Jakarta Sans,Segoe UI,sans-serif" font-size="19" font-weight="800" letter-spacing=".6" fill="url(#lg)">BUSINESS WATCH</text></svg>`;
const LOGO_ON_LIGHT=LOGO.replace(/url\(#lg\)/g,"#8a6a2f").replace('<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8cc8e"/><stop offset="1" stop-color="#b08a4a"/></linearGradient></defs>',"");

const I={
 license:'<path d="M4 6h16v12H4z"/><circle cx="9" cy="11" r="2"/><path d="M6.5 15.5c.6-1.3 1.5-2 2.5-2s1.9.7 2.5 2M14 10h4M14 13h3"/>',
 insurance:'<path d="M12 3 19 6v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
 wc:'<path d="M4 16h16M6 16v-3a6 6 0 0 1 12 0v3M10 7.3V5h4v2.3M4 16v2h16v-2"/>',
 registration:'<path d="M4 20h16M5 20V9l7-5 7 5v11M9 20v-6h6v6M9 11h.01M15 11h.01"/>',
 safety:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 other:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
 home:'<path d="M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10"/>',
 docs:'<path d="M3 7h7l2 2h9v11H3z"/><path d="M3 7V5h6l2 2"/>',
 upd:'<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
 menu:'<circle cx="12" cy="12" r="9.5"/><circle cx="7.8" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="16.2" cy="12" r=".6" fill="currentColor"/>',
 chev:'<path d="m9 6 6 6-6 6"/>',
 upload:'<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
 plan:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 alert:'<path d="M12 7v6M12 16.5v.5"/>', clock:'<circle cx="12" cy="12" r="7"/><path d="M12 8.5V12l2.5 2"/>', eye:'<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/>', check:'<path d="m6 12.5 4 4 8-9"/>',
 phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
 out:'<path d="M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10"/>',
 safe:'<path d="M12 3 19 6v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z"/><path d="M12 8v4M12 15.5v.5"/>',
 people:'<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5a3 3 0 0 1 0 6M17.5 14.5a5.5 5.5 0 0 1 3 4.5"/>',
 tools:'<path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.6-.6-.6-2.6z"/>'
};
const TI={need:"alert",soon:"clock",review:"eye",ok:"check"};
const ic=(k,cls="")=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

const T={
 en:{demo:"Demo with an example client. Uploads stay in this browser tab and are not sent to anyone.",
  hi:n=>n?`Welcome back, ${n}`:"Welcome back", fileFor:b=>`Business File for ${b}`,
  leadNeed:k=>k?`${k} item${k>1?"s":""} need${k>1?"":"s"} you. Everything else, we're watching.`:"Nothing needs you right now. We're watching your file.",
  tHome:"Home", tDocs:"Documents", tUpd:"Updates", tPlan:"My plan", menu:"Menu",
  need:"Action needed", soon:"Renew soon", review:"Under review", ok:"Current",
  todo:"What we need from you", upload:"Upload", uploadNew:"Upload new copy", uploadThis:"Upload this first",
  allDocs:"All", expires:"Expires", expired:"Expired", noCopy:"We don't have a copy yet", requested:"Requested by NBW",
  inReview:"We're checking it", daysLeft:d=>`${d} days left`, daysLate:d=>`${d} days past due`, today:"Today",
  latest:"Latest from your NBW team", team:"NBW Client Team", teamSub:"Real people reviewing your file", seeAll:"See all updates", other:"Upload a different document",
  upTitle:"Upload a document", upWhich:"Which document is this?", upOther:"Something else", upDrop:"Tap to choose a file", upDrop2:"or drag it here. PDF, photo, or scan.",
  upNew:"New expiration date (if you know it)", upNote:"Note for NBW (optional)", upNotePh:"e.g. Renewed online on Monday", upSend:"Send to NBW",
  upErr:"Choose at least one file first.", upPick:"Choose a document", upErrDoc:"Choose which document this file is for.", upErrSize:n=>`${n} was skipped. Files must be a PDF or photo under 15 MB.`,
  upDone:"Sent. We'll review it and update your file.", remove:"Remove",
  hist:"History", category:"Type", status:"Status", close:"Close",
  evUploaded:"You uploaded", evReviewed:"Reviewed by NBW. Added to your file.", evRequested:"NBW asked for a copy", evFlag:"NBW flagged it as expiring",
  planName:"Plan", planPrice:"Price", nextReport:"Next status report", contact:"Your NBW contact", phone:"Phone", email:"Email",
  planFine:"NBW provides administrative and research support. We are not a law firm, accounting firm, or insurance agency.",
  lang:"Language", size:"Text size", colors:"Colors", cLight:"Light", cDark:"Dark", cHigh:"High contrast",
  signCheck:e=>`If ${e} has an NBW file, we just emailed a sign-in code to it. Enter it below.`, signCode:"Sign-in code", signVerify:"Sign in", signBad:"That code didn't work. Check the newest email, or send a new one.", signWait:"Too many tries. Wait a minute, then send again.", signOffline:"We couldn't reach NBW. Check your connection and try again.",
  notReady:"The Business File isn't open yet. Call us and we'll help you get started.", loading:"Opening your file…", noFile:"Your sign-in worked, but your Business File isn't set up yet. Call us and we'll finish it.", noUpd:"No updates yet.", upSending:"Sending…", upFail:"That didn't send. Check your connection and try again. Nothing was lost.",
  signTitle:"Sign in to your Business File", signLead:"Enter your email and we'll send you a one-time sign-in code. No password to remember.", signBtn:"Email me a code", signDemo:"Open the demo instead", signSent:e=>`In the real app, a sign-in link would go to ${e}.`, signout:"Sign out", install:"Install on your phone", insLead:"Add the app to your home screen so it opens like any other app. No App Store needed.", insIos:"iPhone (Safari)", insIos1:"Tap the Share button at the bottom of Safari.", insIos2:"Scroll down and tap Add to Home Screen.", insIos3:"Tap Add. The NBW icon appears on your home screen.", insAnd:"Android (Chrome)", insAnd1:"Tap the ⋮ menu in the top corner.", insAnd2:"Tap Install app or Add to Home screen.", insAnd3:"Tap Install.",
  cats:{license:"License",insurance:"Insurance",wc:"Workers' comp",registration:"Registration",safety:"Safety & Heat",other:"Other"},
  tSafe:"Safety", safeTitle:"Health & safety", safeLead:"What Nevada requires once you have 11 or more employees, and how NBW can get it done for you.",
  crewQ:"How many employees do you have?", crew1:"1–10", crew2:"11–25", crew3:"26 or more", crewHint:"Count everyone on payroll: full-time, part-time and seasonal. Use your highest count in the year.",
  heatQ:"In any job, do most workers spend more than 30 minutes of any hour in heat?", heatHint:"Count outdoor work, hot kitchens, warehouses and vehicles without working air conditioning. Don't count breaks.", yes:"Yes", no:"No", notSure:"Not sure",
  reqTitle:"What you must have in place", reqSmall:"With 10 or fewer employees, Nevada doesn't require a written safety program. You must still protect your workers from heat.",
  r1:"Written workplace safety program", r1m:"A written program for your workplace that includes a training program.",
  r2:"Training your crew understands", r2m:"Give and teach the program in a language and format each employee understands.",
  r3:"Temporary workers trained", r3m:"If you use a staffing agency, train those workers on safety before they start at each site, or as soon as possible after.",
  r4:"Safety committee", r4m:"A committee with employee representatives, paid for their committee time.",
  r5:"Written job hazard analysis for heat", r5m:"A written look at each job and task where heat illness could happen. Judge conditions as if workers had no water, rest or shade.",
  r6:"Heat steps in your safety program", r6m:"Drinkable water, rest breaks for workers showing signs of heat illness, ways to cool down, monitoring of conditions, work changes when heat rises, training and emergency response.",
  r7:"A designated person", r7m:"Someone named and able to watch conditions and call emergency services if a worker gets sick.",
  r8:"Heat training for every covered employee", r8m:"Everyone in a covered job learns to recognize heat illness and the steps that lower the risk.",
  heatUnsure:"If you're not sure, plan for the heat rule. Our free check can tell you whether any of your jobs count.",
  reqFine:"This is a plain-language summary of NRS 618.383 and Nevada's heat rule (Regulation R131-24, enforced since April 29, 2025) to help you plan. It is not legal advice.",
  pkgTitle:"Have NBW do it for you", pkgLead:(p,pct)=>`As a ${p} client you save ${pct}% on any Safety & Heat package.`, pkgLeadNone:"Order through your Business File.", recommended:"Best fit", order:"Order", oneTime:"one time", perMonth:"per month",
  pkHeat:"Heat Plan", pkHeatM:"For 11 to 25 employees. We do your hazard analysis, write your heat plan, set up your designated person and train one crew.",
  pkFull:"Full Safety Program + Heat Plan", pkFullM:"Everything in the Heat Plan, plus a complete written safety program, injury reporting steps, safety committee setup (26+ employees) and two trainings.",
  pkReady:"Stay Ready", pkReadyM:"A spring review before summer, yearly refresher training, new-hire materials and updates when Nevada rules change.",
  pkKit:"DIY Compliance Kit", pkKitM:"Fill-in safety program and heat plan, hazard worksheet, forms, English and Spanish handouts and step-by-step instructions.",
  pkReview:"Kit + Expert Review", pkReviewM:"Everything in the kit, plus we review your finished draft and walk you through fixes.",
  bigCrew:"More locations or larger crews are quoted after your free check.",
  ordTitle:"Your orders", ordReq:"Requested", ordReqM:"We'll confirm your order and email your invoice.",
  ord:{requested:"Requested",confirmed:"Confirmed",in_progress:"In progress",delivered:"Delivered",cancelled:"Cancelled"}, oSending:"Sending…", oFail:"That didn't send. Check your connection and try again.",
  oSheet:p=>`Order: ${p}`, oList:"Listed price", oYours:"Your price", oStart:"To start", oDelivery:"At delivery", oBilled:"Billed monthly", oNote:"Anything we should know? (optional)", oNotePh:"e.g. Two job sites, Spanish-speaking crew", oSend:"Send order",
  oFine:"No payment now. NBW confirms your order and emails you an invoice.", oDone:"Order sent. We'll confirm it and email your invoice.",
  secReq:"Required", secCrew:"Crew training", secPkg:"Packages",
  reqSum:(n,crew,heat)=>`With ${crew} employees${heat?" and heat on the job":""}, you need these ${n} things in place.`,
  bestForYou:"Best fit for you", otherPkgs:"Other packages",
  doTitle:"What to do", doReview:"Nothing to do. We're checking the copy you sent.", doRequested:"Upload a copy so we can add it to your file.",
  doExpired:"Renew it with the agency that issued it, then upload the new copy here.", doSoon:"Renew it before it expires, then upload the new copy here.", doOk:"Nothing to do right now.",
  crewTitle:"Crew training", crewLead:"A knowledge check for each employee. Hand them the phone: they read the key points, answer and sign.", crewNone:"No employees yet. Add your crew to track their training.",
  addEmp:"Add employee", empName:"Full name", empJob:"Job title (optional)", empAdd:"Add employee", empNeedName:"Enter the employee's name.",
  archive:"Archive employee", archived:"Archived. Their training records stay on file.", tr:{ok:"Current",soon:"Due soon",over:"Overdue",none:"No record"},
  lastDone:"Last completed", dueAgain:"Due again", takeCheck:c=>`Take check: ${c}`, readFirst:"Read this first", fullLesson:"Read the full lesson",
  iRead:"I read these points.", sig:"Employee signature: type your full name", sigFine:"By signing, the employee confirms they reviewed this material. This check is a review, not a certification.",
  chkSubmit:"Sign and submit", chkTitle:c=>`Knowledge check: ${c}`, chkFor:n=>`Employee: ${n}`, chkWrong:n=>`${n} answer${n>1?"s are":" is"} not right. Read the points again and try once more.`,
  chkPassed:(n,c,d)=>`${n} passed ${c}. Due again ${d}. Keep a signed training record as well.`, chkFail:"That didn't save. Check your connection and try again.",
  homeSafe:"Health & safety, done for you", homeSafeM:"See what Nevada requires for your crew size, and have NBW write your plan.", homeSafeBtn:"See requirements"},
 es:{demo:"Demostración con un cliente de ejemplo. Los archivos se quedan en esta pestaña y no se envían a nadie.",
  hi:n=>n?`Bienvenido, ${n}`:"Bienvenido", fileFor:b=>`Expediente de ${b}`,
  leadNeed:k=>k?`${k} documento${k>1?"s":""} necesita${k>1?"n":""} su atención. Nosotros vigilamos todo lo demás.`:"Nada necesita su atención ahora. Estamos vigilando su expediente.",
  tHome:"Inicio", tDocs:"Documentos", tUpd:"Avisos", tPlan:"Mi plan", menu:"Menú",
  need:"Requiere acción", soon:"Renovar pronto", review:"En revisión", ok:"Al día",
  todo:"Lo que necesitamos de usted", upload:"Subir", uploadNew:"Subir copia nueva", uploadThis:"Subir esto primero",
  allDocs:"Todos", expires:"Vence", expired:"Venció", noCopy:"Aún no tenemos una copia", requested:"Solicitado por NBW",
  inReview:"Lo estamos revisando", daysLeft:d=>`Faltan ${d} días`, daysLate:d=>`${d} días vencido`, today:"Hoy",
  latest:"Lo último de su equipo NBW", team:"Equipo de Clientes NBW", teamSub:"Personas reales revisando su expediente", seeAll:"Ver todos los avisos", other:"Subir otro documento",
  upTitle:"Subir un documento", upWhich:"¿Qué documento es?", upOther:"Otro documento", upDrop:"Toque para elegir un archivo", upDrop2:"o arrástrelo aquí. PDF, foto o escaneo.",
  upNew:"Nueva fecha de vencimiento (si la sabe)", upNote:"Nota para NBW (opcional)", upNotePh:"p. ej. Lo renové en línea el lunes", upSend:"Enviar a NBW",
  upErr:"Primero elija al menos un archivo.", upPick:"Elija un documento", upErrDoc:"Elija a qué documento corresponde este archivo.", upErrSize:n=>`Se omitió ${n}. Los archivos deben ser PDF o foto de menos de 15 MB.`,
  upDone:"Enviado. Lo revisaremos y actualizaremos su expediente.", remove:"Quitar",
  hist:"Historial", category:"Tipo", status:"Estado", close:"Cerrar",
  evUploaded:"Usted lo subió", evReviewed:"Revisado por NBW. Agregado a su expediente.", evRequested:"NBW pidió una copia", evFlag:"NBW avisó que está por vencer",
  planName:"Plan", planPrice:"Precio", nextReport:"Próximo informe", contact:"Su contacto en NBW", phone:"Teléfono", email:"Correo",
  planFine:"NBW ofrece apoyo administrativo y de investigación. No somos un despacho de abogados, contadores ni una agencia de seguros.",
  lang:"Idioma", size:"Tamaño del texto", colors:"Colores", cLight:"Claro", cDark:"Oscuro", cHigh:"Alto contraste",
  signCheck:e=>`Si ${e} tiene un expediente con NBW, le enviamos un código para entrar. Escríbalo abajo.`, signCode:"Código para entrar", signVerify:"Entrar", signBad:"Ese código no funcionó. Revise el correo más reciente o pida uno nuevo.", signWait:"Demasiados intentos. Espere un minuto y vuelva a enviar.", signOffline:"No pudimos conectar con NBW. Revise su conexión e intente otra vez.",
  notReady:"El expediente aún no está disponible. Llámenos y le ayudamos a empezar.", loading:"Abriendo su expediente…", noFile:"Entró bien, pero su expediente aún no está listo. Llámenos y lo terminamos.", noUpd:"Aún no hay avisos.", upSending:"Enviando…", upFail:"No se envió. Revise su conexión e intente otra vez. No se perdió nada.",
  signTitle:"Entre a su expediente", signLead:"Escriba su correo y le enviaremos un código para entrar. Sin contraseñas.", signBtn:"Enviarme un código", signDemo:"Abrir la demostración", signSent:e=>`En la app real, el enlace se enviaría a ${e}.`, signout:"Salir", install:"Instalar en su teléfono", insLead:"Agregue la app a su pantalla de inicio para abrirla como cualquier otra app. No necesita la App Store.", insIos:"iPhone (Safari)", insIos1:"Toque el botón Compartir abajo en Safari.", insIos2:"Baje y toque Agregar a inicio.", insIos3:"Toque Agregar. El ícono de NBW aparece en su pantalla de inicio.", insAnd:"Android (Chrome)", insAnd1:"Toque el menú ⋮ en la esquina de arriba.", insAnd2:"Toque Instalar app o Agregar a la pantalla principal.", insAnd3:"Toque Instalar.",
  cats:{license:"Licencia",insurance:"Seguro",wc:"Compensación laboral",registration:"Registro",safety:"Seguridad y calor",other:"Otro"},
  tSafe:"Seguridad", safeTitle:"Salud y seguridad", safeLead:"Lo que Nevada exige cuando tiene 11 empleados o más, y cómo NBW puede hacerlo por usted.",
  crewQ:"¿Cuántos empleados tiene?", crew1:"1–10", crew2:"11–25", crew3:"26 o más", crewHint:"Cuente a todos en la nómina: tiempo completo, medio tiempo y de temporada. Use el número más alto del año.",
  heatQ:"En algún puesto, ¿la mayoría de los trabajadores pasa más de 30 minutos de cada hora en el calor?", heatHint:"Cuente el trabajo al aire libre, cocinas calientes, bodegas y vehículos sin aire acondicionado funcionando. No cuente los descansos.", yes:"Sí", no:"No", notSure:"No sé",
  reqTitle:"Lo que debe tener en orden", reqSmall:"Con 10 empleados o menos, Nevada no exige un programa de seguridad por escrito. Aun así, debe proteger a sus trabajadores del calor.",
  r1:"Programa de seguridad por escrito", r1m:"Un programa escrito para su lugar de trabajo que incluya un programa de capacitación.",
  r2:"Capacitación que su equipo entienda", r2m:"Entregue y enseñe el programa en un idioma y formato que cada empleado entienda.",
  r3:"Capacitación de trabajadores temporales", r3m:"Si usa una agencia de personal, capacite a esos trabajadores en seguridad antes de que empiecen en cada sitio, o lo antes posible después.",
  r4:"Comité de seguridad", r4m:"Un comité con representantes de los empleados, a quienes se les paga el tiempo del comité.",
  r5:"Análisis escrito de riesgos por calor", r5m:"Una revisión escrita de cada puesto y tarea donde podría ocurrir una enfermedad por calor. Evalúe las condiciones como si los trabajadores no tuvieran agua, descanso ni sombra.",
  r6:"Medidas contra el calor en su programa", r6m:"Agua potable, descansos para quien muestre señales de enfermedad por calor, formas de refrescarse, vigilancia de las condiciones, cambios en el trabajo cuando sube el calor, capacitación y respuesta a emergencias.",
  r7:"Una persona designada", r7m:"Alguien nombrado y capaz de vigilar las condiciones y llamar a emergencias si un trabajador se enferma.",
  r8:"Capacitación sobre el calor para cada empleado cubierto", r8m:"Todos en un puesto cubierto aprenden a reconocer la enfermedad por calor y los pasos que reducen el riesgo.",
  heatUnsure:"Si no está seguro, planee como si la regla del calor aplicara. Nuestra revisión gratuita le dice si alguno de sus puestos cuenta.",
  reqFine:"Este es un resumen en lenguaje sencillo de NRS 618.383 y la regla de calor de Nevada (Reglamento R131-24, en vigor desde el 29 de abril de 2025) para ayudarle a planear. No es asesoría legal.",
  pkgTitle:"Deje que NBW lo haga", pkgLead:(p,pct)=>`Como cliente de ${p}, ahorra ${pct}% en cualquier paquete de Seguridad y Calor.`, pkgLeadNone:"Pídalo desde su expediente.", recommended:"Recomendado", order:"Pedir", oneTime:"pago único", perMonth:"al mes",
  pkHeat:"Plan contra el calor", pkHeatM:"Para 11 a 25 empleados. Hacemos su análisis de riesgos, escribimos su plan contra el calor, preparamos a su persona designada y capacitamos a un equipo.",
  pkFull:"Programa de seguridad completo + Plan contra el calor", pkFullM:"Todo lo del Plan contra el calor, más un programa de seguridad escrito completo, pasos para reportar lesiones, formación del comité de seguridad (26+ empleados) y dos capacitaciones.",
  pkReady:"Siempre listo", pkReadyM:"Revisión en primavera antes del verano, capacitación anual de repaso, materiales para nuevos empleados y avisos cuando cambian las reglas de Nevada.",
  pkKit:"Kit para hacerlo usted mismo", pkKitM:"Programa de seguridad y plan contra el calor para llenar, hoja de riesgos, formularios, folletos en inglés y español e instrucciones paso a paso.",
  pkReview:"Kit + revisión experta", pkReviewM:"Todo lo del kit, más revisamos su borrador terminado y le explicamos cómo corregirlo.",
  bigCrew:"Varias ubicaciones o equipos más grandes se cotizan después de su revisión gratuita.",
  ordTitle:"Sus pedidos", ordReq:"Solicitado", ordReqM:"Confirmaremos su pedido y le enviaremos la factura por correo.",
  ord:{requested:"Solicitado",confirmed:"Confirmado",in_progress:"En proceso",delivered:"Entregado",cancelled:"Cancelado"}, oSending:"Enviando…", oFail:"No se envió. Revise su conexión e intente otra vez.",
  oSheet:p=>`Pedido: ${p}`, oList:"Precio de lista", oYours:"Su precio", oStart:"Para empezar", oDelivery:"Al entregar", oBilled:"Se cobra cada mes", oNote:"¿Algo que debamos saber? (opcional)", oNotePh:"p. ej. Dos obras, equipo que habla español", oSend:"Enviar pedido",
  oFine:"No se cobra nada ahora. NBW confirma su pedido y le envía la factura por correo.", oDone:"Pedido enviado. Lo confirmaremos y le enviaremos la factura.",
  secReq:"Requisitos", secCrew:"Capacitación", secPkg:"Paquetes",
  reqSum:(n,crew,heat)=>`Con ${crew} empleados${heat?" y calor en el trabajo":""}, necesita tener estas ${n} cosas en orden.`,
  bestForYou:"Lo mejor para usted", otherPkgs:"Otros paquetes",
  doTitle:"Qué hacer", doReview:"Nada por ahora. Estamos revisando la copia que envió.", doRequested:"Suba una copia para agregarla a su expediente.",
  doExpired:"Renuévela con la agencia que la emitió y luego suba la copia nueva aquí.", doSoon:"Renuévela antes de que venza y luego suba la copia nueva aquí.", doOk:"Nada por ahora.",
  crewTitle:"Capacitación del equipo", crewLead:"Una prueba de conocimientos para cada empleado. Páseles el teléfono: leen los puntos clave, contestan y firman.", crewNone:"Aún no hay empleados. Agregue a su equipo para llevar su capacitación.",
  addEmp:"Agregar empleado", empName:"Nombre completo", empJob:"Puesto (opcional)", empAdd:"Agregar empleado", empNeedName:"Escriba el nombre del empleado.",
  archive:"Archivar empleado", archived:"Archivado. Sus registros de capacitación se conservan.", tr:{ok:"Al día",soon:"Vence pronto",over:"Vencida",none:"Sin registro"},
  lastDone:"Última vez", dueAgain:"Vence", takeCheck:c=>`Hacer prueba: ${c}`, readFirst:"Lea esto primero", fullLesson:"Leer la lección completa",
  iRead:"Leí estos puntos.", sig:"Firma del empleado: escriba su nombre completo", sigFine:"Al firmar, el empleado confirma que revisó este material. Esta prueba es un repaso, no una certificación.",
  chkSubmit:"Firmar y enviar", chkTitle:c=>`Prueba: ${c}`, chkFor:n=>`Empleado: ${n}`, chkWrong:n=>`${n} respuesta${n>1?"s no son correctas":" no es correcta"}. Lea los puntos otra vez e intente de nuevo.`,
  chkPassed:(n,c,d)=>`${n} aprobó ${c}. Vence ${d}. Guarde también un registro de capacitación firmado.`, chkFail:"No se guardó. Revise su conexión e intente otra vez.",
  homeSafe:"Salud y seguridad, hecho por usted", homeSafeM:"Vea lo que Nevada exige según el tamaño de su equipo y deje que NBW escriba su plan.", homeSafeBtn:"Ver requisitos"}
};

// Course content for the demo. The live app reads the same content from the
// database, where the answer key stays on the server.
const DEMO_COURSES=[
  {id:"heat",title:"Heat Illness Prevention",title_es:"Prevención de enfermedades por calor",renew_months:12,lesson_url:"https://nevadabusinesswatch.com/lessons.html#s7l1",
   lesson:["Drink water often, before you feel thirsty. Your employer must give you drinkable water.","Take rest breaks in shade or a cool area, and take one right away if you feel signs of heat illness.","Early signs: heavy sweating, cramps, headache, dizziness, nausea or weakness. Stop, cool down, drink water and tell your supervisor.","Severe signs: confusion, slurred speech, fainting, collapse or a seizure. Call 911 right away and start cooling the person.","New and returning workers need shorter first days to get used to the heat.","Your workplace has a designated person who watches conditions and calls emergency services if someone gets sick. Know who it is.","When most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks, the employer needs a written job hazard analysis, judged as if workers had no water, rest or shade."],
   lesson_es:["Tome agua seguido, antes de sentir sed. Su empleador debe darle agua potable.","Descanse en la sombra o en un lugar fresco, y descanse de inmediato si siente señales de enfermedad por calor.","Señales tempranas: sudor abundante, calambres, dolor de cabeza, mareo, náuseas o debilidad. Pare, refrésquese, tome agua y avise a su supervisor.","Señales graves: confusión, dificultad para hablar, desmayo, colapso o convulsiones. Llame al 911 de inmediato y empiece a enfriar a la persona.","Los trabajadores nuevos y los que regresan necesitan días más cortos al principio para acostumbrarse al calor.","Su lugar de trabajo tiene una persona designada que vigila las condiciones y llama a emergencias si alguien se enferma. Sepa quién es.","Cuando la mayoría de los trabajadores de un puesto pasa más de 30 minutos de cada 60 en el calor, sin contar descansos, el empleador necesita un análisis escrito de riesgos, evaluado como si no hubiera agua, descanso ni sombra."]},
  {id:"hazcom",title:"Hazard Communication",title_es:"Comunicación de peligros",renew_months:12,lesson_url:null,
   lesson:["You have a right to know about the hazardous chemicals you work with.","Safety Data Sheets (SDS) explain each chemical's hazards and how to protect yourself. They must be available to you during every shift.","Shipped chemical containers are labeled with the product identifier, a signal word, hazard statements and pictograms.","Read the label before you use a chemical. Do not use anything from an unlabeled container: ask your supervisor.","Wear the protective equipment the SDS calls for, and know where to find first aid steps for each chemical."],
   lesson_es:["Usted tiene derecho a conocer los químicos peligrosos con los que trabaja.","Las Hojas de Datos de Seguridad (SDS) explican los peligros de cada químico y cómo protegerse. Deben estar disponibles para usted en cada turno.","Los envases de químicos que se envían llevan una etiqueta con el identificador del producto, una palabra de advertencia, frases de peligro y pictogramas.","Lea la etiqueta antes de usar un químico. No use nada de un envase sin etiqueta: pregunte a su supervisor.","Use el equipo de protección que indica la SDS y sepa dónde encontrar los primeros auxilios para cada químico."]}
];
const DEMO_QUESTIONS=[
  {course_id:"heat",position:1,prompt:"When does a job need heat provisions and a written job hazard analysis?",prompt_es:"¿Cuándo necesita un puesto medidas contra el calor y un análisis escrito de riesgos?",
   options:["Only when it is over 105°F","When most workers in the job are in the heat more than 30 minutes of any 60, not counting breaks","Whenever any worker is outdoors for more than 10 minutes"],
   options_es:["Solo cuando hace más de 105°F","Cuando la mayoría de los trabajadores del puesto pasa más de 30 minutos de cada 60 en el calor, sin contar descansos","Siempre que un trabajador esté afuera más de 10 minutos"]},
  {course_id:"heat",position:2,prompt:"When you write the job hazard analysis, how should you judge conditions?",prompt_es:"Al escribir el análisis de riesgos, ¿cómo se evalúan las condiciones?",
   options:["As if workers had no water, rest or shade","Based on the coolest part of the shift","Based on how workers say they feel"],
   options_es:["Como si los trabajadores no tuvieran agua, descanso ni sombra","Según la parte más fresca del turno","Según cómo dicen sentirse los trabajadores"]},
  {course_id:"heat",position:3,prompt:"What is the designated person's job?",prompt_es:"¿Cuál es el trabajo de la persona designada?",
   options:["Sign the training roster each year","Monitor conditions and call emergency services if a worker gets sick","Decide which workers can skip breaks"],
   options_es:["Firmar la lista de capacitación cada año","Vigilar las condiciones y llamar a emergencias si un trabajador se enferma","Decidir qué trabajadores pueden saltarse los descansos"]},
  {course_id:"heat",position:4,prompt:"A worker shows signs of severe heat illness (confusion, collapse). What do you do?",prompt_es:"Un trabajador muestra señales graves de enfermedad por calor (confusión, colapso). ¿Qué hace?",
   options:["Have them rest in the shade until the shift ends","Call 911 right away and start cooling them","Give them water and send them home to recover"],
   options_es:["Dejarlo descansar en la sombra hasta que termine el turno","Llamar al 911 de inmediato y empezar a enfriarlo","Darle agua y mandarlo a casa a recuperarse"]},
  {course_id:"hazcom",position:1,prompt:"When must Safety Data Sheets be available to employees?",prompt_es:"¿Cuándo deben estar disponibles las Hojas de Datos de Seguridad para los empleados?",
   options:["Only on request, within 30 days","During every shift, for the chemicals in their work area","Only during the yearly training"],
   options_es:["Solo si las piden, dentro de 30 días","En cada turno, para los químicos de su área de trabajo","Solo durante la capacitación anual"]},
  {course_id:"hazcom",position:2,prompt:"Which of these must appear on a shipped chemical container's label?",prompt_es:"¿Qué debe aparecer en la etiqueta de un envase de químicos que se envía?",
   options:["Product identifier, signal word, hazard statements and pictograms","Only the brand name","The purchase date and price"],
   options_es:["Identificador del producto, palabra de advertencia, frases de peligro y pictogramas","Solo el nombre de la marca","La fecha y el precio de compra"]}
];
// Demo only: the live app grades on the server and never sees these
const DEMO_ANSWERS={heat:[1,0,1,1],hazcom:[1,0]};

function seed(){
  const d=(n,es,cat,exp,extra={})=>({id:Math.random().toString(36).slice(2,9),n,es,cat,exp,files:[],hist:[],...extra});
  return {
    client:{first:"Marco",biz:"Desert Ridge Roofing LLC",plan:"Contractor Watch",price:"$199 / month",discountPct:15},
    signedIn:true, filter:"all", crew:"mid", heat:"yes", orders:[],
    courses:DEMO_COURSES, questions:DEMO_QUESTIONS,
    emps:[{id:"e-maria",name:"Maria Chen",job:"Crew lead",active:true},{id:"e-luis",name:"Luis Ortega",job:"Roofer",active:true},{id:"e-sam",name:"Sam Patel",job:"Laborer",active:true}],
    atts:[{emp:"e-maria",course:"heat",on:inDays(-60),signed:"Maria Chen"},{emp:"e-maria",course:"hazcom",on:inDays(-60),signed:"Maria Chen"},
          {emp:"e-luis",course:"heat",on:inDays(-345),signed:"Luis Ortega"},{emp:"e-luis",course:"hazcom",on:inDays(-120),signed:"Luis Ortega"}],
    docs:[
      d("NSCB contractor license C-15","Licencia de contratista NSCB C-15","license",inDays(-6),{hist:[{k:"evFlag",at:inDays(-40)}]}),
      d("Written heat illness prevention plan","Plan escrito de prevención de enfermedades por calor","safety","",{requested:true,hist:[{k:"evRequested",at:inDays(-9)}]}),
      d("General liability certificate","Certificado de responsabilidad civil","insurance",inDays(19),{hist:[{k:"evFlag",at:inDays(-3)},{k:"evReviewed",at:inDays(-346)}]}),
      d("Workers' comp policy","Póliza de compensación laboral","wc",inDays(47),{hist:[{k:"evReviewed",at:inDays(-318)}]}),
      d("City of North Las Vegas business license","Licencia comercial de North Las Vegas","license",inDays(140),{review:true,files:["NLV-license-2026.pdf"],hist:[{k:"evUploaded",at:inDays(-1),file:"NLV-license-2026.pdf"}]}),
      d("Nevada State Business License","Licencia comercial del Estado de Nevada","registration",inDays(212),{hist:[{k:"evReviewed",at:inDays(-153)}]}),
      d("Clark County business license","Licencia comercial del Condado de Clark","license",inDays(260),{hist:[{k:"evReviewed",at:inDays(-105)}]})
    ],
    updates:[
      {at:inDays(-1),en:"Got your North Las Vegas license. We're checking it against the city's records and will add it to your file.",es:"Recibimos su licencia de North Las Vegas. La estamos comparando con los registros de la ciudad y la agregaremos a su expediente."},
      {at:inDays(-3),en:"Your general liability certificate expires in about 3 weeks. Ask your insurance agent for the renewed certificate and upload it here.",es:"Su certificado de responsabilidad civil vence en unas 3 semanas. Pida el certificado renovado a su agente de seguros y súbalo aquí."},
      {at:inDays(-6),en:"Your NSCB license shows as expired on the state board's site. Renewing it is the top priority, since you can't bid or work without it.",es:"Su licencia NSCB aparece vencida en el sitio de la junta estatal. Renovarla es la prioridad, porque sin ella no puede ofertar ni trabajar."},
      {at:inDays(-9),en:"Nevada requires a written heat illness plan for crews working outdoors. If you have one, upload it. If not, we can write it with you.",es:"Nevada exige un plan escrito contra el calor para equipos que trabajan al aire libre. Si lo tiene, súbalo. Si no, podemos hacerlo con usted."}
    ]
  };
}

// Live mode: real accounts and storage through Supabase. Only a page without
// business-file-config.js (business-file-demo.html) runs as a demo; the real
// page never shows example data, even before Supabase is set up.
const CFG=window.NBW_CONFIG||{}, CONFIGURED=!!window.NBW_CONFIG;
const NOT_READY=CONFIGURED&&!(CFG.supabaseUrl&&CFG.supabaseAnonKey);
const LIVE=CONFIGURED&&!NOT_READY&&!!window.supabase;
const sb=LIVE?window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey):null;
const EVK={uploaded:"evUploaded",reviewed:"evReviewed",requested:"evRequested",flag:"evFlag"};
const dayOf=ts=>iso(new Date(ts));
let S=CONFIGURED?{signedIn:false,loading:LIVE,broken:!LIVE,filter:"all",docs:[],updates:[],client:null,crew:"mid",heat:"yes",orders:[],courses:[],questions:[],emps:[],atts:[]}:seed(), lang="en", scheme="ivory", fs=16, tab="home", sheet=null, pending=[], lastFocus=null;
try{const p=JSON.parse(localStorage.getItem("nbw-portal-prefs-v2")||"{}"); if(p.lang) lang=p.lang; if(p.fs) fs=p.fs; if(p.scheme) scheme=p.scheme;}catch(e){}
const savePrefs=()=>{try{localStorage.setItem("nbw-portal-prefs-v2",JSON.stringify({lang,fs,scheme}))}catch(e){}};
const applyPrefs=()=>{const r=document.documentElement; r.style.setProperty("--fs",fs+"px"); if(scheme==="ivory") r.removeAttribute("data-scheme"); else r.setAttribute("data-scheme",scheme);};
const t=()=>T[lang];
const dname=d=>lang==="es"?d.es:d.n;
const left=d=>d.exp?Math.round((new Date(d.exp+"T00:00:00")-TODAY)/DAY):null;
function st(d){ if(d.review) return "review"; if(!d.exp) return "need"; const l=left(d); return l<0?"need":l<=60?"soon":"ok"; }
const ORD={need:0,soon:1,review:2,ok:3};
const pill=s=>`<span class="pill p-${s}">${t()[s]}</span>`;
const fmt=s=>new Date(s+"T00:00:00").toLocaleDateString(lang==="es"?"es-US":"en-US",{month:"short",day:"numeric",year:"numeric"});
function sub(d){
  const s=st(d), L=t();
  if(s==="review") return L.inReview;
  if(!d.exp) return d.requested?`${L.noCopy}. ${L.requested}.`:L.noCopy;
  const l=left(d);
  if(l<0) return `${L.expired} ${fmt(d.exp)} · ${L.daysLate(-l)}`;
  if(l===0) return `${L.expires} ${L.today}`;
  return `${L.expires} ${fmt(d.exp)} · ${L.daysLeft(l)}`;
}
const sorted=()=>[...S.docs].sort((a,b)=>ORD[st(a)]-ORD[st(b)]||(left(a)??1e4)-(left(b)??1e4));
const counts=()=>S.docs.reduce((c,d)=>(c[st(d)]++,c),{need:0,soon:0,review:0,ok:0});
const urgentId=()=>{const u=sorted().find(d=>["need","soon"].includes(st(d))); return u&&u.id;};

// primaryId: the single document on this screen whose Upload button is solid.
function docRow(d,primaryId){
  const s=st(d), L=t(), actionable=s==="need"||s==="soon";
  const btn = d.id===primaryId
    ? `<button class="btn btn-primary" data-up="${d.id}">${ic("upload")}${L.uploadThis}</button>`
    : actionable ? `<button class="btn btn-line" data-up="${d.id}">${L.upload}</button>` : "";
  return `<li class="doc"><button class="doc-main" data-det="${d.id}" aria-label="${esc(dname(d))}, ${L[s]}">
      <span class="ico c-${d.cat}">${ic(d.cat)}</span>
      <span class="doc-text"><span class="n">${esc(dname(d))}</span>${pill(s)}<span class="m">${esc(sub(d))}</span></span>
      ${ic("chev","chev")}</button>${btn?`<div class="act">${btn}</div>`:""}</li>`;
}

async function loadLive(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){Object.assign(S,{signedIn:false,loading:false,client:null,docs:[],updates:[],orders:[],emps:[],atts:[]}); render(); return;}
  const links=await sb.from("client_users").select("client_id").eq("user_id",session.user.id).limit(1);
  if(links.error) return liveFail();
  if(!links.data.length){Object.assign(S,{signedIn:true,loading:false,noFile:true,client:null,docs:[],updates:[],orders:[],emps:[],atts:[]}); render(); return;}
  const cid=links.data[0].client_id;
  const [c,d,e,u,o,k,em,co,qu,at]=await Promise.all([
    sb.from("clients").select("*").eq("id",cid).single(),
    sb.from("documents").select("*").eq("client_id",cid),
    sb.from("document_events").select("*").eq("client_id",cid).order("created_at",{ascending:false}).limit(500),
    sb.from("updates").select("*").eq("client_id",cid).order("created_at",{ascending:false}).limit(50),
    sb.from("orders").select("*").eq("client_id",cid).order("created_at",{ascending:false}),
    sb.from("packages").select("*"),
    sb.from("employees").select("*").eq("client_id",cid).order("full_name"),
    sb.from("courses").select("*").order("sort"),
    sb.from("course_questions").select("*").order("position"),
    sb.from("attestations").select("*").eq("client_id",cid)]);
  if([c,d,e,u,o,k,em,co,qu,at].some(x=>x.error)) return liveFail();
  S.emps=em.data.map(x=>({id:x.id,name:x.full_name,job:x.job_title,active:x.active}));
  S.courses=co.data; S.questions=qu.data;
  S.atts=at.data.map(x=>({emp:x.employee_id,course:x.course_id,on:x.completed_on,signed:x.signed_name}));
  S.client={id:cid,first:c.data.contact_first,biz:c.data.business_name,plan:c.data.plan,price:c.data.price_text,discountPct:c.data.discount_pct||0};
  // The database's prices win, so the app shows what the order will charge
  k.data.forEach(r=>{const p=PKGS.find(x=>x.id===r.id); if(p) p.price=r.price_cents/100;});
  S.orders=o.data.map(x=>({id:x.id,pkg:x.package_id,at:dayOf(x.created_at),status:x.status,price:x.price_cents,note:x.staff_note}));
  S.docs=d.data.map(x=>({id:x.id,n:x.name_en,es:x.name_es||x.name_en,cat:x.category,exp:x.expires_on||"",review:x.in_review,requested:x.requested,files:[],
    hist:e.data.filter(v=>v.document_id===x.id).map(v=>({k:EVK[v.kind],at:dayOf(v.created_at),file:v.file_name,note:v.note}))}));
  S.updates=u.data.map(x=>({at:dayOf(x.created_at),en:x.body_en,es:x.body_es||x.body_en}));
  Object.assign(S,{signedIn:true,loading:false,noFile:false,broken:false}); render();
}
function liveFail(){Object.assign(S,{loading:false,broken:true}); render();}
function viewStatus(msg){return `<main><div class="signin">${scheme==="night"?LOGO:LOGO_ON_LIGHT}<p class="lead">${msg}</p></div></main>`;}

function viewHome(){
  const L=t(), c=counts(), todo=sorted().filter(d=>["need","soon"].includes(st(d))), u=S.updates[0], pid=urgentId();
  return `<div class="stack">
    <div><h1>${esc(L.hi(S.client.first))}</h1><div class="kicker">${esc(L.fileFor(S.client.biz))}</div><p class="lead">${L.leadNeed(c.need+c.soon)}</p></div>
    <div class="health">${["need","soon","review","ok"].map(k=>`<button class="tile" data-goto="${k}" style="--c:var(--t-${k})"><i>${ic(TI[k])}</i><b>${c[k]}</b><span>${L[k]}</span></button>`).join("")}</div>
    <h2 class="section-h">${L.todo}</h2><section class="panel"><ul class="list">${todo.length?todo.map(d=>docRow(d,pid)).join(""):`<li class="empty">${L.leadNeed(0)}</li>`}</ul></section>
    <button class="btn btn-${pid?"line":"primary"} btn-lg" data-up="">${pid?L.other:L.upTitle}</button>
    <section class="panel"><div class="note-card" style="padding-top:16px"><span class="ico c-safety">${ic("safe")}</span><div><h2>${L.homeSafe}</h2><p style="color:var(--muted)">${L.homeSafeM}</p>
      <button class="btn btn-line" data-tab="safe" data-go="req" style="margin-top:10px">${L.homeSafeBtn}</button></div></div></section>
    ${u?`<section class="panel"><div class="panel-h"><h2>${L.latest}</h2><button class="link link-more" data-tab="upd">${L.seeAll}${ic("chev")}</button></div>
      <div class="note-card">${TEAM_AVATAR}<div><small>${L.team} · ${fmt(u.at)}</small><p>${esc(u[lang])}</p></div></div></section>`:""}
  </div>`;
}
function viewDocs(){
  const L=t(), f=S.filter, list=sorted().filter(d=>f==="all"||st(d)===f), pid=urgentId();
  const shownPid=list.some(d=>d.id===pid)?pid:null;
  return `<div class="stack"><div><h1>${L.tDocs}</h1><div class="kicker">${esc(S.client.biz)}</div></div>
   <div class="filters" role="group">${["all","need","soon","review","ok"].map(k=>`<button class="chip" data-f="${k}" aria-pressed="${f===k}">${k==="all"?L.allDocs:L[k]}</button>`).join("")}</div>
   <section class="panel"><ul class="list">${list.length?list.map(d=>docRow(d,shownPid)).join(""):`<li class="empty">—</li>`}</ul></section>
   <button class="btn btn-${shownPid?"line":"primary"} btn-lg" data-up="">${shownPid?L.other:L.upTitle}</button></div>`;
}
function viewUpd(){
  const L=t();
  return `<div class="stack"><div><h1>${L.tUpd}</h1><div class="kicker">${esc(S.client.biz)}</div></div>
   <section class="panel"><ul class="feed">${S.updates.length?"":`<li class="empty">${L.noUpd}</li>`}${S.updates.map(u=>`<li><time>${L.team} · ${fmt(u.at)}</time><div>${esc(u[lang])}</div></li>`).join("")}</ul></section></div>`;
}
// Same packages and prices as safety.html. Business Watch and Contractor Watch
// clients take 15% off; deposits for done-for-you work are 50% to start.
const PKGS=[
  {id:"heat",k:"pkHeat",price:1200,dfy:true,crews:["mid"],heat:true},
  {id:"full",k:"pkFull",price:2400,dfy:true,crews:["mid","big"]},
  {id:"ready",k:"pkReady",price:200,monthly:true,crews:["mid","big"]},
  {id:"review",k:"pkReview",price:399,crews:["small","mid"]},
  {id:"kit",k:"pkKit",price:199,crews:["small","mid"]}
];
const money=n=>"$"+n.toLocaleString("en-US");
const pct=()=>(S.client&&S.client.discountPct)||0;
// Whole dollars, matching order_package() on the server
const yourPrice=p=>Math.round(p.price*(100-pct())/100);
const OPEN=["requested","confirmed","in_progress"];
// Best fit: the Heat Plan for 11-25 with heat exposure, the full program otherwise, the kit for small crews.
const bestFit=()=>S.crew==="small"?"kit":S.crew==="mid"&&S.heat!=="no"?"heat":"full";

// Three sections, so each fits on about one phone screen
function viewSafe(){
  const L=t(), sec=S.safeSec||"req";
  const seg=(items,cur,attr)=>`<div class="seg" role="group">${items.map(([v,l])=>`<button type="button" ${attr}="${v}" aria-pressed="${cur===v}">${l}</button>`).join("")}</div>`;
  const body=sec==="crew"?viewCrew():sec==="pkg"?viewPkgs():viewReqs();
  return `<div class="stack"><div><h1>${L.safeTitle}</h1><div class="kicker">${esc(S.client.biz)}</div></div>
    <div class="safe-nav">${seg([["req",L.secReq],["crew",L.secCrew],["pkg",L.secPkg]],sec,"data-safesec")}</div>
    ${body}</div>`;
}
function viewReqs(){
  const L=t(), crew=S.crew, heat=S.heat, heatOn=heat!=="no";
  const seg=(items,cur,attr)=>`<div class="seg" role="group">${items.map(([v,l])=>`<button type="button" ${attr}="${v}" aria-pressed="${cur===v}">${l}</button>`).join("")}</div>`;
  const item=(n,k,cite)=>`<li class="req"><span class="chk" aria-hidden="true">${n}</span><div><div class="n">${L[k]}</div><div class="m">${L[k+"m"]}</div><cite>${cite}</cite></div></li>`;
  const reqs=[];
  if(crew!=="small"){ reqs.push(["r1","NRS 618.383"],["r2","NRS 618.383"],["r3","NRS 618.383"]); if(crew==="big") reqs.push(["r4","NRS 618.383"]); }
  if(heatOn) reqs.push(["r5","R131-24"], ...(crew!=="small"?[["r6","R131-24"]]:[]), ["r7","R131-24"], ["r8","R131-24"]);
  const crewLabel={small:L.crew1,mid:L.crew2,big:L.crew3}[crew];
  return `<p class="lead" style="margin:0">${L.safeLead}</p>
    <div class="group"><span class="group-l" id="crew-q">${L.crewQ}</span>${seg([["small",L.crew1],["mid",L.crew2],["big",L.crew3]],crew,"data-crew")}<p class="fine" style="padding:0 4px">${L.crewHint}</p></div>
    <div class="group"><span class="group-l">${L.heatQ}</span>${seg([["yes",L.yes],["no",L.no],["unsure",L.notSure]],heat,"data-heat")}<p class="fine" style="padding:0 4px">${L.heatHint}</p></div>
    <h2 class="section-h">${L.reqTitle}</h2>
    <section class="panel">${reqs.length?`<p class="req-sum">${L.reqSum(reqs.length,crewLabel,heatOn)}</p>`:""}
      ${crew==="small"?`<div class="callout" style="margin:12px 16px${reqs.length?" 0":""}">${L.reqSmall}</div>`:""}
      ${reqs.length?`<ul class="reqs">${reqs.map(([k,c],i)=>item(i+1,k,c)).join("")}</ul>`:""}
      ${heat==="unsure"?`<div class="callout" style="margin:0 16px 12px">${L.heatUnsure}</div>`:""}</section>
    <p class="fine">${L.reqFine}</p>`;
}
function viewPkgs(){
  const L=t(), crew=S.crew, heatOn=S.heat!=="no", disc=pct()>0;
  const fit=bestFit(), list=PKGS.filter(p=>p.crews.includes(crew)&&(!p.heat||heatOn));
  const best=list.filter(p=>p.id===fit), others=list.filter(p=>p.id!==fit);
  // Reads top to bottom: what it is, what it costs, then the button
  const pkgRow=p=>{ const open=S.orders.find(o=>o.pkg===p.id&&OPEN.includes(o.status||"requested"));
    return `<li class="pkg"><div class="n">${L[p.k]}</div>
      <div class="m">${L[p.k+"M"]}</div>
      <div class="price">${disc?`<s>${money(p.price)}</s>`:""}<b>${money(yourPrice(p))}</b><span>${p.monthly?L.perMonth:L.oneTime}</span></div>
      ${open?`<span class="pill p-review">${L.ord[open.status||"requested"]}</span>`:`<button class="btn ${p.id===fit?"btn-primary":"btn-line"}" data-order="${p.id}">${L.order}</button>`}</li>`; };
  return `${S.orders.length?`<h2 class="section-h">${L.ordTitle}</h2><section class="panel"><ul class="feed">${S.orders.map(o=>`<li><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><strong>${L[PKGS.find(p=>p.id===o.pkg).k]}</strong><span class="pill ${o.status==="delivered"||o.status==="confirmed"?"p-ok":o.status==="cancelled"?"p-soon":"p-review"}">${L.ord[o.status||"requested"]}</span></div><time>${fmt(o.at)} · ${esc(o.note||((o.status||"requested")==="requested"?L.ordReqM:""))}</time></li>`).join("")}</ul></section>`:""}
    <p class="lead" style="margin:0">${disc?L.pkgLead(esc(S.client.plan||"NBW"),pct()):L.pkgLeadNone}</p>
    ${best.length?`<h2 class="section-h">${L.bestForYou}</h2><section class="panel"><ul class="list">${best.map(pkgRow).join("")}</ul></section>`:""}
    ${others.length?`<h2 class="section-h">${L.otherPkgs}</h2><section class="panel"><ul class="list">${others.map(pkgRow).join("")}</ul></section>`:""}
    <p class="fine">${L.bigCrew}</p>`;
}
// Training standing comes from the latest signed check, never stored
const addMonths=(s,m)=>{const [y,mo,d]=s.split("-").map(Number), x=new Date(y,mo-1+m,d); if(x.getDate()!==d) x.setDate(0); return iso(x);};
const ctitle=c=>lang==="es"?c.title_es:c.title;
// Short names keep the crew list scannable; full names are on each employee's page
const SHORT={heat:{en:"Heat",es:"Calor"},hazcom:{en:"Chemicals",es:"Químicos"}};
const cshort=c=>(SHORT[c.id]||{})[lang]||ctitle(c);
function standing(empId,c){
  let last=null; S.atts.forEach(a=>{ if(a.emp===empId&&a.course===c.id&&(!last||a.on>last.on)) last=a; });
  if(!last) return {k:"none"};
  const due=addMonths(last.on,c.renew_months), l=Math.round((new Date(due+"T00:00:00")-TODAY)/DAY);
  return {k:l<0?"over":l<=30?"soon":"ok",last:last.on,due,signed:last.signed};
}
const TRP={ok:"p-ok",soon:"p-soon",over:"p-need",none:"p-need"};
function viewCrew(){
  const L=t(), emps=S.emps.filter(e=>e.active);
  return `<p class="lead" style="margin:0">${L.crewLead}</p>
    <section class="panel">
    <ul class="list" id="crew">${emps.length?emps.map(e=>`<li class="doc"><button class="doc-main" data-emp="${esc(e.id)}">
        <span class="ico c-wc">${ic("people")}</span>
        <span class="doc-text"><span class="n">${esc(e.name)}</span>${e.job?`<span class="m">${esc(e.job)}</span>`:""}
          <span style="display:flex;flex-wrap:wrap;gap:6px">${S.courses.map(c=>{const st=standing(e.id,c); return `<span class="pill ${TRP[st.k]}">${esc(cshort(c))}: ${L.tr[st.k]}</span>`;}).join("")}</span></span>
        ${ic("chev","chev")}</button></li>`).join(""):`<li class="empty">${L.crewNone}</li>`}</ul>
    <div style="padding:4px 16px 16px"><button class="btn btn-line" data-addemp>${L.addEmp}</button></div></section>`;
}
function sheetEmp(id){
  const L=t(), e=S.emps.find(x=>x.id===id);
  return `<div class="sheet-h"><div style="display:flex;gap:12px;align-items:center;min-width:0"><span class="ico c-wc">${ic("people")}</span><h2>${esc(e.name)}</h2></div><button class="x" data-close aria-label="${L.close}">×</button></div>
   ${S.courses.map(c=>{const st=standing(e.id,c); return `<div class="group"><span class="group-l">${esc(ctitle(c))}</span>
     <dl class="facts"><dt>${L.status}</dt><dd><span class="pill ${TRP[st.k]}">${L.tr[st.k]}</span></dd><dt>${L.lastDone}</dt><dd>${st.last?fmt(st.last):"—"}</dd><dt>${L.dueAgain}</dt><dd>${st.due?fmt(st.due):"—"}</dd></dl>
     <button class="btn ${st.k==="ok"?"btn-line":"btn-primary"}" data-check="${esc(c.id)}" data-for="${esc(e.id)}">${L.takeCheck(esc(ctitle(c)))}</button></div>`;}).join("")}
   <button class="link" data-archive="${esc(e.id)}" style="color:var(--need)">${L.archive}</button>`;
}
function sheetCheck(empId,cid,err,signed){
  const L=t(), e=S.emps.find(x=>x.id===empId), c=S.courses.find(x=>x.id===cid);
  const qs=S.questions.filter(q=>q.course_id===cid).sort((a,b)=>a.position-b.position);
  const pts=(lang==="es"?c.lesson_es:c.lesson)||[];
  return `<div class="sheet-h"><h2>${L.chkTitle(esc(ctitle(c)))}</h2><button class="x" data-close aria-label="${L.close}">×</button></div>
   <form id="chk-form" data-check-emp="${esc(empId)}" data-check-course="${esc(cid)}" style="display:grid;gap:16px">
   <p class="lead" style="margin:0"><strong>${L.chkFor(esc(e.name))}</strong></p>
   <div class="err" id="chk-err" aria-live="assertive" tabindex="-1">${esc(err||"")}</div>
   <div class="group"><span class="group-l">${L.readFirst}</span><ol class="steps">${pts.map(p=>`<li>${esc(p)}</li>`).join("")}</ol>
     ${c.lesson_url?`<a class="link link-more" href="${esc(c.lesson_url)}" target="_blank" rel="noopener">${L.fullLesson}${ic("chev")}</a>`:""}</div>
   <label class="f" style="display:flex;gap:10px;align-items:center;font-size:1rem;color:var(--ink)"><input type="checkbox" name="read" required style="width:22px;height:22px;accent-color:var(--tint)"> ${L.iRead}</label>
   ${qs.map((q,i)=>`<fieldset style="border:0;margin:0;padding:0;display:grid;gap:8px"><legend style="font-weight:600;margin-bottom:6px">${i+1}. ${esc(lang==="es"?q.prompt_es:q.prompt)}</legend>
     ${(lang==="es"?q.options_es:q.options).map((o,oi)=>`<label style="display:flex;gap:10px;align-items:flex-start;background:var(--surface);border:var(--bw) solid var(--sep);border-radius:10px;padding:10px 12px;cursor:pointer"><input type="radio" name="q${q.position}" value="${oi}" required style="margin-top:4px;accent-color:var(--tint)"> <span>${esc(o)}</span></label>`).join("")}</fieldset>`).join("")}
   <label class="f" for="chk-sig">${L.sig}<input id="chk-sig" name="sig" type="text" required maxlength="80" autocomplete="off" value="${esc(signed||"")}"></label>
   <p class="fine" style="padding:0 4px">${L.sigFine}</p>
   <button class="btn btn-primary btn-lg" type="submit">${L.chkSubmit}</button></form>`;
}
function sheetAddEmp(err){
  const L=t();
  return `<div class="sheet-h"><h2>${L.addEmp}</h2><button class="x" data-close aria-label="${L.close}">×</button></div>
   <form id="emp-form" style="display:grid;gap:16px">
   <label class="f" for="emp-name">${L.empName}<input id="emp-name" type="text" required maxlength="80" autocomplete="off"></label>
   <label class="f" for="emp-job">${L.empJob}<input id="emp-job" type="text" maxlength="80" autocomplete="off"></label>
   <div class="err" aria-live="polite">${esc(err||"")}</div>
   <button class="btn btn-primary btn-lg" type="submit">${L.empAdd}</button></form>`;
}

function sheetOrder(id){
  const L=t(), p=PKGS.find(x=>x.id===id), price=yourPrice(p), start=Math.round(price/2), disc=pct()>0;
  return `<div class="sheet-h"><h2>${L.oSheet(L[p.k])}</h2><button class="x" data-close aria-label="${L.close}">×</button></div>
   <p class="lead" style="margin:0">${L[p.k+"M"]}</p>
   <dl class="facts">${disc?`<dt>${L.oList}</dt><dd><s>${money(p.price)}</s></dd>`:""}<dt>${L.oYours}</dt><dd>${money(price)} ${p.monthly?L.perMonth:L.oneTime}</dd>
     ${p.dfy?`<dt>${L.oStart}</dt><dd>${money(start)}</dd><dt>${L.oDelivery}</dt><dd>${money(price-start)}</dd>`:p.monthly?`<dt>${L.oBilled}</dt><dd>${money(price)}</dd>`:""}</dl>
   <label class="f" for="o-note">${L.oNote}<textarea id="o-note" placeholder="${L.oNotePh}"></textarea></label>
   <p class="fine" style="padding:0 4px">${L.oFine}</p>
   <div class="err" id="o-err" aria-live="polite"></div>
   <button class="btn btn-primary btn-lg" id="o-send" data-pkg="${p.id}" type="button">${L.oSend}</button>`;
}

function viewPlan(){
  const L=t(), nr=new Date(TODAY.getFullYear(),TODAY.getMonth()+1,1);
  return `<div class="stack"><div><h1>${L.tPlan}</h1><div class="kicker">${esc(S.client.biz)}</div></div>
   <section class="panel"><dl class="plan"><div><dt>${L.planName}</dt><dd>${esc(S.client.plan)}</dd></div><div><dt>${L.planPrice}</dt><dd>${esc(S.client.price)}</dd></div><div><dt>${L.nextReport}</dt><dd>${fmt(iso(nr))}</dd></div></dl></section>
   <section class="panel"><div class="note-card" style="padding-top:16px">${TEAM_AVATAR}<div><h2>${L.team}</h2><small>${L.teamSub} · English & Español</small>
     <dl class="facts" style="margin-top:10px"><dt>${L.phone}</dt><dd class="copyable">${esc(CFG.contactPhone||"(702) 343-2387")}</dd><dt>${L.email}</dt><dd class="copyable">${esc(CFG.contactEmail||"info@nbw.com")}</dd></dl></div></div></section>
   <p class="fine">${L.planFine}</p></div>`;
}
function viewSignin(){
  const L=t();
  return `<main><form class="signin" id="signin">${scheme==="night"?LOGO:LOGO_ON_LIGHT}<h1>${L.signTitle}</h1><p>${L.signLead}</p>
   <label class="f" style="width:100%;text-align:left" for="si-email">Email<input id="si-email" type="email" required autocomplete="email" placeholder="you@business.com" value="${esc(S.codeFor||"")}"></label>
   <button class="btn ${S.codeFor?"btn-line":"btn-primary"} btn-lg" type="submit">${L.signBtn}</button><p id="si-msg" aria-live="polite">${S.signMsg||""}</p>
   ${S.codeFor?`</form><form class="signin" id="si-code-form" style="margin-top:0"><label class="f" style="width:100%;text-align:left" for="si-code">${L.signCode}<input id="si-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required></label>
   <button class="btn btn-primary btn-lg" type="submit">${L.signVerify}</button>`:""}
   ${CONFIGURED?"":`<button class="link" type="button" id="si-demo">${L.signDemo}</button>`}</form></main>`;
}

function sheetMenu(){
  const L=t(), seg=(items,cur,attr)=>`<div class="seg">${items.map(([v,l])=>`<button type="button" ${attr}="${v}" aria-pressed="${cur==v}">${l}</button>`).join("")}</div>`;
  return `<div class="sheet-h"><h2>${L.menu}</h2><button class="x" data-close aria-label="${L.close}">×</button></div>
   <div class="group"><span class="group-l">${L.lang}</span>${seg([["en","English"],["es","Español"]],lang,"data-lang")}</div>
   <div class="group"><span class="group-l">${L.size}</span>${seg([[15,"A−"],[16,"A"],[19,"A+"],[22,"A++"]],fs,"data-fs")}</div>
   <div class="group"><span class="group-l">${L.colors}</span>${seg([["ivory",`<span class="swatch" style="background:#f8f6f1"></span>${L.cLight}`],["night",`<span class="swatch" style="background:#141b33"></span>${L.cDark}`],["contrast",`<span class="swatch" style="background:#ffd23f"></span>${L.cHigh}`]],scheme,"data-color")}</div>
   ${S.signedIn?`<div class="menu-links"><button type="button" id="install"><span class="ico c-insurance">${ic("phone")}</span>${L.install}</button><button type="button" data-tab="plan"><span class="ico c-license">${ic("plan")}</span>${L.tPlan}</button><button type="button" id="signout"><span class="ico c-safety">${ic("out")}</span>${L.signout}</button></div>`:""}`;
}
function sheetInstall(){
  const L=t(), steps=a=>`<ol class="steps">${a.map(x=>`<li>${x}</li>`).join("")}</ol>`;
  return `<div class="sheet-h"><h2>${L.install}</h2><button class="x" data-close aria-label="${L.close}">×</button></div>
   <p class="lead" style="margin:0">${L.insLead}</p>
   <div class="group"><span class="group-l">${L.insIos}</span>${steps([L.insIos1,L.insIos2,L.insIos3])}</div>
   <div class="group"><span class="group-l">${L.insAnd}</span>${steps([L.insAnd1,L.insAnd2,L.insAnd3])}</div>`;
}
function sheetUpload(id){
  const L=t(), opts=sorted().map(d=>`<option value="${d.id}" ${d.id===id?"selected":""}>${esc(dname(d))}</option>`).join("");
  return `<div class="sheet-h"><h2>${L.upTitle}</h2><button class="x" data-close aria-label="${L.close}">×</button></div>
   <label class="f" for="up-doc">${L.upWhich}<select id="up-doc">${id?"":`<option value="" selected disabled>${L.upPick}</option>`}${opts}<option value="other">${L.upOther}</option></select></label>
   <label class="drop" id="drop" for="up-file"><input id="up-file" type="file" multiple accept=".pdf,image/*">${ic("upload")}<strong>${L.upDrop}</strong><span class="fine">${L.upDrop2}</span></label>
   <ul class="files" id="up-list"></ul>
   <label class="f" for="up-exp">${L.upNew}<input id="up-exp" type="date"></label>
   <label class="f" for="up-note">${L.upNote}<textarea id="up-note" placeholder="${L.upNotePh}"></textarea></label>
   <div class="err" id="up-err" aria-live="polite"></div>
   <button class="btn btn-primary btn-lg" id="up-send" type="button">${L.upSend}</button>`;
}
function advice(d){
  const L=t(), s=st(d);
  if(s==="review") return L.doReview;
  if(s==="ok") return L.doOk;
  if(s==="soon") return L.doSoon;
  return d.exp?L.doExpired:L.doRequested;
}
function sheetDetail(id){
  const L=t(), d=S.docs.find(x=>x.id===id), s=st(d);
  const ev=[...d.hist].sort((a,b)=>b.at.localeCompare(a.at)).map(h=>`<li>${L[h.k]}${h.file?`: ${esc(h.file)}`:""}${h.note?`<small>“${esc(h.note)}”</small>`:""}<small>${fmt(h.at)}</small></li>`).join("");
  return `<div class="sheet-h"><div style="display:flex;gap:12px;align-items:center;min-width:0"><span class="ico c-${d.cat}">${ic(d.cat)}</span><h2>${esc(dname(d))}</h2></div><button class="x" data-close aria-label="${L.close}">×</button></div>
   <dl class="facts"><dt>${L.status}</dt><dd>${pill(s)}</dd><dt>${L.category}</dt><dd>${L.cats[d.cat]}</dd><dt>${L.expires}</dt><dd>${d.exp?fmt(d.exp):"—"}</dd></dl>
   <div class="callout"><strong>${L.doTitle}:</strong> ${esc(advice(d))}</div>
   <h3 style="font-size:1rem">${L.hist}</h3><ul class="timeline">${ev||`<li>—</li>`}</ul>
   <button class="btn btn-primary btn-lg" data-up="${d.id}">${s==="need"||s==="soon"?L.upload:L.uploadNew}</button>`;
}

function render(){
  const L=t(); applyPrefs();
  document.documentElement.lang=lang;
  const dn=document.getElementById("demo-note"); dn.textContent=L.demo; dn.hidden=CONFIGURED;
  const app=document.getElementById("app");
  const sheetHtml = sheet?`<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grabber" aria-hidden="true"></div>${sheet.type==="up"?sheetUpload(sheet.id):sheet.type==="menu"?sheetMenu():sheet.type==="install"?sheetInstall():sheet.type==="order"?sheetOrder(sheet.id):sheet.type==="emp"?sheetEmp(sheet.id):sheet.type==="check"?sheetCheck(sheet.emp,sheet.course,sheet.err,sheet.signed):sheet.type==="addemp"?sheetAddEmp(sheet.err):sheetDetail(sheet.id)}</div></div>`:"";
  const bare=body=>`<header class="app"><div class="bar">${scheme==="contrast"?LOGO_ON_LIGHT:LOGO}<button class="menu-btn" id="menu" aria-label="${L.menu}">${ic("menu")}<span>${L.menu}</span></button></div></header>`+body+sheetHtml;
  if(S.loading){app.innerHTML=bare(viewStatus(L.loading)); return;}
  if(NOT_READY){app.innerHTML=bare(viewStatus(`${L.notReady}<br><br>${esc(CFG.contactPhone||"(702) 343-2387")}`)); return;}
  if(S.broken){app.innerHTML=bare(viewStatus(L.signOffline)); return;}
  if(S.signedIn&&S.noFile){app.innerHTML=bare(viewStatus(`${L.noFile}<br><br>${esc(CFG.contactPhone||"(702) 343-2387")}`)); return;}
  if(!S.signedIn){app.innerHTML=`<header class="app"><div class="bar" style="justify-content:flex-end"><button class="menu-btn" id="menu" aria-label="${L.menu}">${ic("menu")}<span>${L.menu}</span></button></div></header>`+viewSignin()+sheetHtml; return;}
  const c=counts(), views={home:viewHome,docs:viewDocs,safe:viewSafe,upd:viewUpd,plan:viewPlan};
  const tabs=[["home",L.tHome],["docs",L.tDocs],["safe",L.tSafe],["upd",L.tUpd]];
  const badge=k=>k==="docs"&&c.need?`<span class="count">${c.need}</span>`:"";
  const tabBtns=tabs.map(([k,v])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${ic(k)}${v}${badge(k)}</button>`).join("");
  app.innerHTML=`<header class="app"><div class="bar">${scheme==="contrast"?LOGO_ON_LIGHT:LOGO}<button class="menu-btn" id="menu" aria-label="${L.menu}">${ic("menu")}<span>${L.menu}</span></button></div>
     <nav class="tabs" role="tablist"><div class="seg-wrap">${tabBtns}</div></nav></header>
   <main>${views[tab]()}</main>
   <nav class="bottom" role="tablist">${tabBtns}</nav>
   ${sheetHtml}`;
  if(sheet?.type==="up") wireUpload();
  if(sheet){ const errEl=document.querySelector(".sheet #chk-err"); const first=errEl&&errEl.textContent?errEl:document.querySelector(".sheet select, .sheet textarea, .sheet input[type=text], .sheet .x"); first&&first.focus(); }
  else if(lastFocus){ const el=document.querySelector(lastFocus); el&&el.focus({preventScroll:true}); lastFocus=null; }
}

function toast(msg){const el=document.createElement("div");el.className="toast";el.setAttribute("role","status");el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3200);}

function wireUpload(){
  const inp=document.getElementById("up-file"), drop=document.getElementById("drop"), list=document.getElementById("up-list"), err=document.getElementById("up-err");
  const draw=()=>list.innerHTML=pending.map((f,i)=>`<li><span>${esc(f.name)}</span><button class="link" data-rm="${i}">${t().remove}</button></li>`).join("");
  const add=files=>{err.textContent=""; [...files].forEach(f=>{ if(f.size>15*1024*1024||!/^(application\/pdf|image\/)/.test(f.type)) err.textContent=t().upErrSize(f.name); else pending.push(f); }); draw();};
  draw();
  inp.addEventListener("change",()=>{add(inp.files); inp.value="";});
  ["dragenter","dragover"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add("over")}));
  ["dragleave","drop"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove("over")}));
  drop.addEventListener("drop",ev=>add(ev.dataTransfer.files));
  list.addEventListener("click",e=>{const b=e.target.closest("[data-rm]"); if(b){pending.splice(+b.dataset.rm,1); draw();}});
  document.getElementById("up-send").addEventListener("click",()=>{
    if(!document.getElementById("up-doc").value){err.textContent=t().upErrDoc; return;}
    if(!pending.length){err.textContent=t().upErr; return;}
    const which=document.getElementById("up-doc").value, exp=document.getElementById("up-exp").value, note=document.getElementById("up-note").value.trim();
    if(LIVE){ sendLive(which,exp,note,err); return; }
    let d=S.docs.find(x=>x.id===which);
    if(!d){ d={id:Math.random().toString(36).slice(2,9),n:pending[0].name,es:pending[0].name,cat:"other",exp:"",files:[],hist:[]}; S.docs.push(d); }
    pending.forEach(f=>{d.files.push(f.name); d.hist.push({k:"evUploaded",at:iso(TODAY),file:f.name,note});});
    if(exp) d.exp=exp;
    d.review=true; d.requested=false;
    pending=[]; sheet=null; render(); toast(t().upDone);
  });
}

async function sendLive(which,exp,note,err){
  const L=t(), btn=document.getElementById("up-send"), cid=S.client.id, docId=which==="other"?null:which;
  btn.disabled=true; btn.textContent=L.upSending; err.textContent="";
  try{
    const files=[];
    for(const f of pending){
      const path=`${cid}/${docId||"new"}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g,"_").slice(-120)}`;
      const up=await sb.storage.from("client-files").upload(path,f,{contentType:f.type,upsert:false});
      if(up.error) throw up.error;
      files.push({name:f.name,path});
    }
    const rpc=await sb.rpc("submit_upload",{p_client_id:cid,p_document_id:docId,p_new_name:docId?null:pending[0].name,p_files:files,p_expires_on:exp||null,p_note:note||null});
    if(rpc.error) throw rpc.error;
    pending=[]; sheet=null; toast(L.upDone); loadLive().catch(liveFail);
  }catch(e){ err.textContent=L.upFail; btn.disabled=false; btn.textContent=L.upSend; }
}

document.addEventListener("focusin",e=>{ if(!sheet){ const b=e.target.closest("[data-up],[data-det],[data-order],#menu"); if(b) lastFocus=b.id==="menu"?"#menu":b.dataset.up!==undefined?`[data-up="${b.dataset.up}"]`:b.dataset.order!==undefined?`[data-order="${b.dataset.order}"]`:`[data-det="${b.dataset.det}"]`; }});
document.addEventListener("click",e=>{
  const g=s=>e.target.closest(s); let b;
  if(b=g("[data-tab]")){tab=b.dataset.tab; if(b.dataset.go) S.safeSec=b.dataset.go; sheet=null; render(); window.scrollTo(0,0); return;}
  if(b=g("[data-goto]")){tab="docs"; S.filter=b.dataset.goto; render(); return;}
  if(b=g("[data-f]")){S.filter=b.dataset.f; render(); return;}
  if(b=g("[data-up]")){sheet={type:"up",id:b.dataset.up}; pending=[]; render(); return;}
  if(b=g("[data-det]")){sheet={type:"det",id:b.dataset.det}; render(); return;}
  if(g("#menu")){sheet={type:"menu"}; render(); return;}
  if(b=g("[data-lang]")){lang=b.dataset.lang; savePrefs(); render(); return;}
  if(b=g("[data-fs]")){fs=+b.dataset.fs; savePrefs(); render(); return;}
  if(b=g("button[data-color]")){scheme=b.dataset.color; savePrefs(); render(); return;}
  if(g("#install")){sheet={type:"install"}; render(); return;}
  if(g("#signout")){sheet=null; if(LIVE){sb.auth.signOut(); return;} S.signedIn=false; render(); return;}
  if(g("[data-close]")||e.target.id==="scrim"){sheet=null; pending=[]; render(); return;}
  if(e.target.id==="si-demo"){S.signedIn=true; tab="home"; render(); return;}
  if(b=g("[data-safesec]")){S.safeSec=b.dataset.safesec; render(); return;}
  if(b=g("[data-crew]")){S.crew=b.dataset.crew; render(); return;}
  if(b=g("[data-heat]")){S.heat=b.dataset.heat; render(); return;}
  if(b=g("[data-order]")){sheet={type:"order",id:b.dataset.order}; render(); return;}
  if(b=g("[data-emp]")){sheet={type:"emp",id:b.dataset.emp}; render(); return;}
  if(b=g("[data-check]")){sheet={type:"check",emp:b.dataset.for,course:b.dataset.check}; render(); return;}
  if(g("[data-addemp]")){sheet={type:"addemp"}; render(); return;}
  if(b=g("[data-archive]")){
    const id=b.dataset.archive, done=()=>{const e=S.emps.find(x=>x.id===id); if(e) e.active=false; sheet=null; render(); toast(t().archived);};
    if(!LIVE) return done();
    sb.from("employees").update({active:false}).eq("id",id).then(({error})=>{ if(error) toast(t().chkFail); else done(); });
    return;
  }
  if(b=g("#o-send")){
    const L=t(), pkg=b.dataset.pkg, note=document.getElementById("o-note").value.trim();
    if(LIVE){
      // The server sets the price; the app only names the package.
      b.disabled=true; b.textContent=L.oSending;
      sb.rpc("order_package",{p_client_id:S.client.id,p_package_id:pkg,p_notes:note||null}).then(({error})=>{
        if(error){ const err=document.getElementById("o-err"); if(err) err.textContent=L.oFail; b.disabled=false; b.textContent=L.oSend; return; }
        sheet=null; toast(L.oDone); loadLive().catch(liveFail);
      });
      return;
    }
    // Demo: the order stays in this tab.
    S.orders.unshift({pkg,at:iso(TODAY),status:"requested"});
    sheet=null; render(); toast(L.oDone); return;
  }
});
document.addEventListener("submit",e=>{
  if(e.target.id==="emp-form"){e.preventDefault();
    const name=document.getElementById("emp-name").value.trim(), job=document.getElementById("emp-job").value.trim()||null;
    if(!name){sheet={type:"addemp",err:t().empNeedName}; render(); return;}
    const added=row=>{S.emps.push(row); S.emps.sort((a,b)=>a.name.localeCompare(b.name)); sheet=null; render();};
    if(!LIVE) return added({id:Math.random().toString(36).slice(2,9),name,job,active:true});
    sb.from("employees").insert({client_id:S.client.id,full_name:name,job_title:job}).select().single().then(({data,error})=>{
      if(error){sheet={type:"addemp",err:t().chkFail}; render(); return;}
      added({id:data.id,name:data.full_name,job:data.job_title,active:true});
    });
    return;
  }
  if(e.target.id==="chk-form"){e.preventDefault();
    const f=e.target, L=t(), empId=f.dataset.checkEmp, cid=f.dataset.checkCourse, fd=new FormData(f), signed=String(fd.get("sig")||"").trim();
    const qs=S.questions.filter(q=>q.course_id===cid).sort((a,b)=>a.position-b.position), answers=qs.map(q=>Number(fd.get("q"+q.position)));
    const c=S.courses.find(x=>x.id===cid), emp=S.emps.find(x=>x.id===empId);
    const result=r=>{
      if(!r.passed){sheet={type:"check",emp:empId,course:cid,err:L.chkWrong(r.wrong),signed}; render(); return;}
      S.atts.push({emp:empId,course:cid,on:r.completed_on,signed});
      sheet={type:"emp",id:empId}; render(); toast(L.chkPassed(emp.name,ctitle(c),fmt(r.due_on)));
    };
    if(!LIVE){
      const wrong=DEMO_ANSWERS[cid].filter((a,i)=>answers[i]!==a).length;
      return result(wrong?{passed:false,wrong}:{passed:true,completed_on:iso(TODAY),due_on:addMonths(iso(TODAY),c.renew_months)});
    }
    const btn=f.querySelector("button[type=submit]"); btn.disabled=true;
    sb.rpc("submit_check",{p_employee_id:empId,p_course_id:cid,p_answers:answers,p_signed_name:signed}).then(({data,error})=>{
      if(error){sheet={type:"check",emp:empId,course:cid,err:L.chkFail,signed}; render(); return;}
      result(data);
    });
    return;
  }
  if(e.target.id==="signin"){e.preventDefault(); const email=document.getElementById("si-email").value.trim(), msg=document.getElementById("si-msg");
    if(!LIVE){msg.textContent=t().signSent(email); return;}
    sb.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}}).then(({error})=>{
      // Same answer whether or not the email has a file, so the form can't be used to look up clients.
      S.codeFor=email; S.signMsg=error&&error.status===429?t().signWait:error&&!error.status?t().signOffline:t().signCheck(email); render();
      const c=document.getElementById("si-code"); c&&c.focus();
    });}
  if(e.target.id==="si-code-form"){e.preventDefault(); const token=document.getElementById("si-code").value.trim();
    sb.auth.verifyOtp({email:S.codeFor,token,type:"email"}).then(({error})=>{
      if(error){document.getElementById("si-msg").textContent=error.status===429?t().signWait:t().signBad; return;}
      S.codeFor=null; S.signMsg=""; S.loading=true; render();
    });}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&sheet){sheet=null;pending=[];render();}});
// Supabase advises against calling it from inside this callback, so the reload runs on the next tick.
if(LIVE) sb.auth.onAuthStateChange(ev=>{ if(["INITIAL_SESSION","SIGNED_IN","SIGNED_OUT"].includes(ev)) setTimeout(()=>{ if(ev==="SIGNED_OUT"){tab="home";} loadLive().catch(liveFail); },0); });
render();
