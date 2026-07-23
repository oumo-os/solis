// Solis Modal System
(function(){
  var overlay=null;
  var stack=[];

  function ensureOverlay(){
    if(overlay) return;
    overlay=document.createElement('div');
    overlay.className='modal-overlay';
    overlay.addEventListener('click',function(e){
      if(e.target===overlay) closeModal();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&stack.length) closeModal();
    });
    document.body.appendChild(overlay);
  }

  function openModal(html,options){
    ensureOverlay();
    options=options||{};
    var size=options.size||'md';
    var closeBtn=options.closeBtn!==false;
    var onOpen=options.onOpen||null;
    var id='modal-'+Date.now();

    var content=document.createElement('div');
    content.className='modal-content modal-'+size;
    content.id=id;
    content.innerHTML=
      (closeBtn?'<button class="modal-close" onclick="closeModal()">x</button>':'')+
      '<div class="modal-body">'+html+'</div>';

    overlay.appendChild(content);
    overlay.classList.add('active');
    document.body.style.overflow='hidden';
    stack.push({id:id,onClose:options.onClose||null});
    if(onOpen) onOpen(content);
    return id;
  }

  function closeModal(id){
    if(!overlay) return;
    if(id){
      var el=document.getElementById(id);
      if(el) el.remove();
      stack=stack.filter(function(s){return s.id!==id;});
    }else{
      var last=stack.pop();
      if(last){
        var el2=document.getElementById(last.id);
        if(el2) el2.remove();
        if(last.onClose) last.onClose();
      }
    }
    if(stack.length===0){
      overlay.classList.remove('active');
      overlay.innerHTML='';
      document.body.style.overflow='';
    }
  }

  function confirmModal(message,onConfirm,onCancel){
    var html='<div style="text-align:center;padding:8px 0">'+
      '<div style="font-size:14px;color:var(--text);margin-bottom:16px">'+message+'</div>'+
      '<div style="display:flex;gap:8px;justify-content:center">'+
      '<button class="btn btn-sm" onclick="closeModal()">Cancel</button>'+
      '<button class="btn btn-primary" id="modal-confirm-btn">Confirm</button>'+
      '</div></div>';
    openModal(html,{size:'sm',onOpen:function(el){
      el.querySelector('#modal-confirm-btn').addEventListener('click',function(){
        closeModal();
        if(onConfirm) onConfirm();
      });
    }});
  }

  window.openModal=openModal;
  window.closeModal=closeModal;
  window.confirmModal=confirmModal;
})();
