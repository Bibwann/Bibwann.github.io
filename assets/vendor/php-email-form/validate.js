(function () {
  "use strict";

  let forms = document.querySelectorAll('.php-email-form');

  forms.forEach( function(e) {
    e.addEventListener('submit', function(event) {
      event.preventDefault();
      
      // Retrieve the localized message or fallback to the French text
      const alertMsg = (typeof translations !== 'undefined' && translations['contact_form_error']) 
        || "Message indisponible pour l'instant.";
      
      alert(alertMsg);
    });
  });
})();
