// Give the print editor an independent model instance while sharing cached bytes.
export function graphicBaseURL(url){const u=new URL(url,location.origin);u.searchParams.set('graphicBase','1');return u.pathname+u.search;}
export function prepareGraphicBase(root){root?.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.some(m=>/^(Archive print|Core (eye artwork|logo))/i.test(m?.name||''))){o.visible=false;o.userData.studioOriginalArtwork=true;}});return root;}
