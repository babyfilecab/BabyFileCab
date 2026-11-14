// Guards the yearly tax-data update: every year needs the same fields.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./source.cjs');
const start=source.indexOf('const TAX_YEARS');
const end=source.indexOf('// Every year that has at least one IRS rate');
const chunk=source.slice(start,source.indexOf('\n}\n',end)+3);
const box={};vm.createContext(box);
vm.runInContext(chunk+';this.TAX_YEARS=TAX_YEARS;this.RATES=IRS_YEARLY_EXCHANGE_RATES;this.taxDataYears=taxDataYears;this.latestTaxDataYear=latestTaxDataYear;this.currencyDataYears=currencyDataYears;',box);
const statuses=['single','mfj','mfs','hoh','qss'];
const years=Array.from(box.taxDataYears());
assert.ok(years.length>=1);
assert.deepEqual(years,[...years].sort((a,b)=>b-a),'newest first');
assert.equal(box.latestTaxDataYear(),years[0]);
for (const y of years) {
  const c=box.TAX_YEARS[y];
  for (const s of statuses) {
    assert.ok(c.standardDeduction[s]>0,`${y} standardDeduction.${s}`);
    const b=c.ordinaryBrackets[s];
    assert.ok(Array.isArray(b)&&b.length===7&&b[6][0]===Infinity,`${y} brackets ${s}`);
    for (let i=1;i<b.length;i++) assert.ok(b[i][0]>b[i-1][0]&&b[i][1]>b[i-1][1],`${y} brackets ${s} ascending`);
    assert.ok(c.capitalGains[s].zeroMax<c.capitalGains[s].fifteenMax,`${y} capital gains ${s}`);
    assert.ok(c.capitalLossLimit[s]>0&&c.additionalMedicareThreshold[s]>0);
    assert.ok(c.childTaxCredit.phaseoutThreshold[s]>0);
  }
  assert.ok(c.socialSecurityWageBase>0);
  assert.equal(c.estimatedTaxDueDates.length,4,`${y} due dates`);
  assert.ok(c.sources&&c.sources.title&&c.sources.text,`${y} sources`);
}
const cy=Array.from(box.currencyDataYears());
assert.ok(cy.length>=1&&cy[0]>=cy[cy.length-1]);
for (const r of box.RATES) for (const [y,v] of Object.entries(r.rates)) assert.ok(v>0,`${r.code} ${y}`);
console.log('tax data tests passed');
