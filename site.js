(function(){
  var STEPS = [16,18,20];
  var KEY = 'nbw-text-scale';
  var idx = 0;
  try{
    var saved = localStorage.getItem(KEY);
    var n = parseInt(saved,10);
    if(!isNaN(n) && n>=0 && n<STEPS.length) idx = n;
  }catch(e){}
  function apply(){
    document.documentElement.style.fontSize = STEPS[idx]+'px';
    try{ localStorage.setItem(KEY, String(idx)); }catch(e){}
  }
  apply();
  var dec = document.getElementById('tsDec');
  var inc = document.getElementById('tsInc');
  var reset = document.getElementById('tsReset');
  if(dec) dec.addEventListener('click', function(){ if(idx>0){ idx--; apply(); } });
  if(inc) inc.addEventListener('click', function(){ if(idx<STEPS.length-1){ idx++; apply(); } });
  if(reset) reset.addEventListener('click', function(){ idx=0; apply(); });
})();
(function(){
  var header = document.querySelector('header');
  function onScroll(){
    if(!header) return;
    if(window.scrollY > 12){ header.classList.add('is-scrolled'); }
    else { header.classList.remove('is-scrolled'); }
  }
  onScroll();
  window.addEventListener('scroll', onScroll, {passive:true});
})();
(function(){
  var targets = document.querySelectorAll('.head-c, [class*="card"], [class*="-grid"] > *, .founder, .pullquote, .trust-badges, .faq-item, .steps3 > *');
  if(!targets.length) return;
  if(!('IntersectionObserver' in window)){
    targets.forEach(function(t){ t.classList.add('reveal','in-view'); });
    return;
  }
  targets.forEach(function(t){ t.classList.add('reveal'); });
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, {threshold:0.12, rootMargin:'0px 0px -40px 0px'});
  targets.forEach(function(t){ io.observe(t); });
})();
(function(){
  var items = document.querySelectorAll('details');
  items.forEach(function(d){
    var summary = d.querySelector('summary');
    if(!summary) return;
    var toWrap = Array.prototype.filter.call(d.children, function(c){ return c !== summary; });
    if(!toWrap.length) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'details-anim';
    toWrap.forEach(function(c){ wrapper.appendChild(c); });
    d.appendChild(wrapper);
    if(!d.open){ wrapper.style.height = '0px'; }

    summary.addEventListener('click', function(e){
      e.preventDefault();
      if(d.classList.contains('animating')) return;
      d.classList.add('animating');
      if(d.open){
        var startH = wrapper.scrollHeight;
        wrapper.style.height = startH + 'px';
        void wrapper.offsetHeight;
        wrapper.style.height = '0px';
        wrapper.addEventListener('transitionend', function te(ev){
          if(ev.propertyName !== 'height') return;
          wrapper.removeEventListener('transitionend', te);
          d.open = false;
          d.classList.remove('animating');
        });
      } else {
        d.open = true;
        var endH = wrapper.scrollHeight;
        wrapper.style.height = '0px';
        void wrapper.offsetHeight;
        wrapper.style.height = endH + 'px';
        wrapper.addEventListener('transitionend', function te(ev){
          if(ev.propertyName !== 'height') return;
          wrapper.removeEventListener('transitionend', te);
          wrapper.style.height = '';
          d.classList.remove('animating');
        });
      }
    });
  });
})();
(function(){
  var nums = document.querySelectorAll('.stat-num');
  if(!nums.length || !('IntersectionObserver' in window)) return;
  nums.forEach(function(el){
    var raw = el.textContent.trim();
    if(!/^\d+$/.test(raw)) return;
    var target = parseInt(raw, 10);
    el.textContent = '0';
    var done = false;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting && !done){
          done = true;
          io.unobserve(el);
          var start = null;
          var duration = 900;
          function step(ts){
            if(start === null) start = ts;
            var progress = Math.min((ts - start) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(eased * target).toString();
            if(progress < 1){ requestAnimationFrame(step); }
            else { el.textContent = target.toString(); }
          }
          requestAnimationFrame(step);
        }
      });
    }, {threshold:0.4});
    io.observe(el);
  });
})();
(function(){
  var boxes = document.querySelectorAll('.lesson-item ul.lchecklist input[type="checkbox"]');
  if(!boxes.length) return;
  var KEY = 'nbw-lesson-checks', saved = {};
  try{ saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){}
  boxes.forEach(function(box){
    var lesson = box.closest('.lesson-item');
    var list = lesson.querySelectorAll('ul.lchecklist input[type="checkbox"]');
    var id = lesson.id + ':' + Array.prototype.indexOf.call(list, box);
    if(saved[id]) box.checked = true;
    box.addEventListener('change', function(){
      if(box.checked) saved[id] = 1; else delete saved[id];
      try{ localStorage.setItem(KEY, JSON.stringify(saved)); }catch(e){}
    });
  });
})();
