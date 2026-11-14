// Guards the yearly tax-data update: every year needs the same fields.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./source.cjs');
const start=source.indexOf('const TAX_YEARS');
const end=source.indexOf('// Every year that has at least one IRS rate');
const chunk=source.slice(start,source.indexOf('\n}\n',end)+3);
const box={};vm.createContext(box);
vm.runInContext(chunk+';this.TAX_YEARS=TAX_YEARS;this.RATES=IRS_YEARLY_EXCHANGE_RATES;this.taxDataYears=taxDataYears;this.latestTaxDataYear=latestTaxDataYear;this.currencyDataYears=currencyDataYears;this.YEAR_END=TREASURY_YEAR_END_RATES;',box);
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
    assert.ok(c.netInvestmentIncomeThreshold[s]>0,`${y} NIIT ${s}`);
    assert.ok(c.qbi.threshold[s]>0&&c.qbi.phaseInRange[s]>0,`${y} QBI ${s}`);
  }
  assert.ok(c.additionalStandardDeduction.unmarried>c.additionalStandardDeduction.married,`${y} age/blind amounts`);
  assert.ok(c.childTaxCredit.otherDependent>0,`${y} other dependent credit`);
  // The senior, tips and overtime deductions exist for 2025-2028 only.
  const obbba=y>=2025&&y<=2028;
  assert.equal(Boolean(c.seniorDeduction&&c.tipsDeduction&&c.overtimeDeduction),obbba,`${y} 2025-2028 deductions`);
  assert.ok(c.socialSecurityWageBase>0);
  assert.equal(c.estimatedTaxDueDates.length,4,`${y} due dates`);
  assert.ok(c.sources&&c.sources.title&&c.sources.text,`${y} sources`);
}
const cy=Array.from(box.currencyDataYears());
assert.ok(cy.length>=1&&cy[0]>=cy[cy.length-1]);
for (const r of box.RATES) for (const [y,v] of Object.entries(r.rates)) assert.ok(v>0,`${r.code} ${y}`);
// Year-end rates: every currency in the list has them, and they are sane.
const ye=Array.from(box.currencyDataYears('year-end'));
assert.ok(ye.length>=1);
for (const r of box.RATES) {
  if (r.code==='VES') continue; // Treasury quotes a different bolivar
  const rates=box.YEAR_END[r.code];
  assert.ok(rates,`year-end rates for ${r.code}`);
  for (const y of ye) assert.ok(rates[y]>0,`${r.code} year-end ${y}`);
  // Year-end and yearly average should be in the same ballpark.
  const y=ye[0]; if (r.rates[y]) assert.ok(rates[y]/r.rates[y]>0.5&&rates[y]/r.rates[y]<2,`${r.code} ${y} year-end vs average`);
}
console.log('tax data tests passed');
