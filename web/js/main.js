import {openQuickMode, returningPlayer} from './quick-mode.js';
document.querySelector('#btnQuick').addEventListener('click',openQuickMode);
// Returning players skip the landing page and step straight into the box.
if(returningPlayer())openQuickMode();
