import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, contrastText, forBackground, forDarkBackground } from '../../apps/mobile/src/lib/brandColors';
test('texto e iconos mantienen contraste sobre el color sólido de marca, en ambos temas',()=>{
  const values=[0,51,102,153,204,255];
  for(const r of values)for(const g of values)for(const b of values){
    const brand='#'+[r,g,b].map(value=>value.toString(16).padStart(2,'0')).join('');
    for(const primary of [forBackground(brand),forDarkBackground(brand)]){
      const foreground=contrastText(primary);
      assert.ok(contrastRatio(primary,foreground)>=4.5,'Botón sólido '+primary);
    }
  }
});
test('colores vacíos o inválidos usan colores sólidos de respaldo legibles',()=>{
  for(const invalid of ['', '#fff', 'invalid', '#GGHHII']){
    assert.equal(forBackground(invalid),'#5842f4');
    assert.equal(forDarkBackground(invalid),'#7a5cff');
    for(const primary of [forBackground(invalid),forDarkBackground(invalid)]){
      assert.ok(contrastRatio(primary,contrastText(primary))>=4.5,'Respaldo '+primary);
    }
  }
});
