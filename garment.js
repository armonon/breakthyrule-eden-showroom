'use strict';
// A photo-textured, hollow garment approximation. Dimensions are visual estimates.
// This is deliberately separate from the source photographs, which stay unchanged.
window.createGhostGarment = function createGhostGarment(THREE, front, back) {
  const T = THREE, garment = new T.Group();
  garment.name = 'Repent jacket — thin hanging cloth approximation';
  // Keep fabric gauge independent of the empty space inside a hanging garment.
  // The showroom scales this mesh by .43; .0016 is approximately .69 mm there.
  const clothGauge=.0016;
  garment.userData={construction:'photo-projected hanging shell',clothGauge,worldScale:.43,simulated:false};
  // Form Studio's cloth renderer also uses rough physical materials with sheen.
  const outer = new T.MeshPhysicalMaterial({map:front,roughness:.96,metalness:0,sheen:.22,sheenColor:0x77716b,sheenRoughness:1,side:T.FrontSide});
  outer.onBeforeCompile = shader => {
    shader.uniforms.backPhoto = {value:back};
    shader.vertexShader = 'attribute float uvCenter; attribute float panelKind; attribute float photoFacing; varying float garmentFacing; varying float garmentPanel; varying float garmentCenter; varying vec3 garmentPosition; varying vec3 garmentNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ngarmentPosition=position; garmentNormal=normal; garmentCenter=uvCenter; garmentPanel=panelKind; garmentFacing=photoFacing;');
    shader.fragmentShader = 'uniform sampler2D backPhoto; varying float garmentFacing; varying float garmentPanel; varying float garmentCenter; varying vec3 garmentPosition; varying vec3 garmentNormal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      float photoY=garmentPanel>1.5?.715+(garmentPosition.y-.715)*(.240/.165):garmentPosition.y;
      vec2 frontUV=vec2(.5+garmentPosition.x/2.12,.5+photoY/2.12);
      vec2 backUV=vec2(.5-garmentPosition.x/2.12,.5+photoY/2.12);
      // The back reference is framed narrower than the front reference.
      if(garmentPanel<1.5) backUV.x=.5-garmentPosition.x*.90/2.12;
      if(garmentPanel<.5) backUV.y=.09+(backUV.y-.104)*1.009;
      else if(garmentPanel<1.5) backUV.y=.144+(backUV.y-.108)*.94;
      else backUV.y=.847+(photoY-.715)*.288;
      vec3 frontInk=texture2D(map,frontUV).rgb;
      vec3 backInk=texture2D(backPhoto,backUV).rgb;
      vec3 sideFabric=vec3(.075,.067,.069);
      if(garmentPanel>.5) sideFabric=vec3(.14,.125,.113);
      if(garmentPanel>1.5 || (garmentPosition.y<-.62 && garmentPanel>.5) || (garmentPosition.y<-.74 && garmentPanel<.5)) sideFabric=vec3(.065,.05,.045);
      // Ignore the white studio background without stretching a single source
      // column across the sleeve. Unknown surfaces keep a quiet fabric colour.
      frontInk=mix(frontInk,sideFabric,smoothstep(.42,.75,min(frontInk.r,min(frontInk.g,frontInk.b))));
      backInk=mix(backInk,sideFabric,smoothstep(.42,.75,min(backInk.r,min(backInk.g,backInk.b))));
      vec3 cloth=mix(backInk,frontInk,smoothstep(-.18,.18,garmentNormal.z));
      // A narrow side panel uses plain fabric: stretching frontal photographs
      // across that turn creates bright horizontal streaks during rotation.
      cloth=mix(sideFabric,cloth,smoothstep(.20,.80,abs(normalize(garmentNormal).z)));
      diffuseColor.rgb*=cloth*.82;
    `);
  };
  const lining = new T.MeshStandardMaterial({color:0x24201f,roughness:1,side:T.BackSide});
  const rimMaterial = new T.MeshStandardMaterial({color:0x403734,roughness:.9,side:T.DoubleSide});

  function smoothWrapNormals(geometry,rows,around) {
    geometry.computeVertexNormals();
    const normals=geometry.getAttribute('normal'),normal=new T.Vector3();
    // The UV seam has two render vertices at the same point. Share their normal
    // to avoid a bright ridge running down the front of a shallow cloth surface.
    for(let row=0;row<=rows;row++) {
      const a=row*(around+1),b=a+around;
      normal.set(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();
      normals.setXYZ(a,normal.x,normal.y,normal.z);normals.setXYZ(b,normal.x,normal.y,normal.z);
    }
  }

  function sample(profile, y) {
    for(let i=1;i<profile.length;i++) if(y<=profile[i][0]) {
      const a=profile[i-1], b=profile[i], t=(y-a[0])/(b[0]-a[0]);
      return a.slice(1).map((v,k)=>T.MathUtils.lerp(v,b[k+1],t));
    }
    return profile[profile.length-1].slice(1);
  }
  function shell(profile, rows, point, center=()=>0, kind=0) {
    const around=64, positions=[], centers=[], facing=[], indices=[];
    for(let j=0;j<=rows;j++) {
      const y=T.MathUtils.lerp(profile[0][0],profile[profile.length-1][0],j/rows);
      const params=sample(profile,y);
      for(let i=0;i<=around;i++) {
        const p=point(y,params,(i===around?0:i/around)*Math.PI*2);positions.push(...p);centers.push(.5+center(y,params)/2.12);
        facing.push(Math.abs(p[2]-(kind===1?.008:0))/params[params.length-1]);
      }
    }
    for(let j=0;j<rows;j++) for(let i=0;i<around;i++) {
      const a=j*(around+1)+i,b=a+around+1;
      indices.push(a,a+1,b,b,a+1,b+1);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(positions.flatMap((_,i)=>i%3===0?[.5+positions[i]/2.12,.5+positions[i+1]/2.12]:[]),2));
    geometry.setAttribute('photoFacing',new T.Float32BufferAttribute(facing,1));geometry.setAttribute('uvCenter',new T.Float32BufferAttribute(centers,1));geometry.setAttribute('panelKind',new T.Float32BufferAttribute(centers.map(()=>kind),1));geometry.setIndex(indices);smoothWrapNormals(geometry,rows,around);
    const panelName=kind===0?'body':kind===1?'sleeve':'collar';
    const mesh=new T.Mesh(geometry,outer);mesh.name=panelName+' outer';mesh.castShadow=true;mesh.receiveShadow=false;garment.add(mesh);
    // A thin cloth shell, rather than a scaled inner tube with bulky cut edges.
    const insideGeometry=geometry.clone(),inner=insideGeometry.getAttribute('position'),normals=geometry.getAttribute('normal');
    for(let i=0;i<inner.count;i++) inner.setXYZ(i,inner.getX(i)-normals.getX(i)*clothGauge,inner.getY(i)-normals.getY(i)*clothGauge,inner.getZ(i)-normals.getZ(i)*clothGauge);
    smoothWrapNormals(insideGeometry,rows,around);const innerMesh=new T.Mesh(insideGeometry,lining);innerMesh.name=panelName+' lining';garment.add(innerMesh);
    return {profile,geometry,insideGeometry,rows,around,panelName};
  }
  function edge(shape,y) {
    const positions=[],indices=[],outerPosition=shape.geometry.getAttribute('position'),innerPosition=shape.insideGeometry.getAttribute('position');
    const start=(y===shape.profile[0][0]?0:shape.rows)*(shape.around+1);
    // Use the actual surface boundaries, including their normal offset and
    // sleeve slope. Independently sampled rings left cracks at cuffs and hems.
    for(let i=0;i<=shape.around;i++) {
      const v=start+i;
      positions.push(outerPosition.getX(v),outerPosition.getY(v),outerPosition.getZ(v),innerPosition.getX(v),innerPosition.getY(v),innerPosition.getZ(v));
      if(i<shape.around){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();const rim=new T.Mesh(geo,rimMaterial);rim.name=shape.panelName+' open edge';garment.add(rim);
  }
  const body = shell([
    [-.84,.50,.029],[-.77,.515,.034],[-.55,.512,.041],[-.25,.515,.052],
    [.08,.52,.061],[.39,.535,.065],[.51,.55,.064],[.59,.525,.067],[.66,.405,.073],[.72,.26,.078],[.75,.235,.078]
  ],70,(y,[w,d],angle)=>{
    const s=Math.sin(angle),c=Math.cos(angle);
    const hanging=T.MathUtils.smoothstep(.5-y,0,1.2);
    const fold=(.004*Math.sin(s*17+y*1.5)+.002*Math.sin(s*29-y*2))*hanging;
    const lean=.006*Math.sin((y+.84)/1.59*Math.PI);
    // Broad, flatter front/back panels with a small rolled side seam. The hem
    // falls close together instead of continuing an inflated torso cylinder.
    return [w*s,y,lean+(d+fold)*Math.sign(c)*Math.pow(Math.abs(c),.42)];
  });
  edge(body,-.84);
  for(const side of [-1,1]) {
    const sleeve=shell([
      [-.83,.735,.125,.028],[-.70,.76,.14,.034],[-.57,.78,.15,.039],[-.39,.785,.17,.045],
      [-.16,.76,.19,.052],[.09,.695,.20,.059],[.33,.62,.205,.063],[.49,.555,.205,.064],[.62,.50,.14,.060]
    ],64,(y,[center,r,d],angle)=>{
      const s=Math.sin(angle),c=Math.cos(angle),wrinkle=.0015*Math.sin(y*17+angle*3)+.001*Math.sin(y*29-angle*2);
      return [side*center+(r+wrinkle)*s,y-.13*r*s*side,(d+wrinkle)*Math.sign(c)*Math.pow(Math.abs(c),.6)+.008];
    },(y,params)=>side*params[0],1);
    edge(sleeve,-.83);
  }
  const collar=shell([[.715,.232,.079],[.76,.236,.082],[.82,.232,.080],[.88,.228,.077]],28,(y,[w,d],angle)=>[
    w*Math.sin(angle),y+.006*Math.cos(angle*2)-.012*Math.max(0,Math.cos(angle)),d*Math.cos(angle)
  ],()=>0,2);
  edge(collar,.88);
  return garment;
};
