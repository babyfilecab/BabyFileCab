// Checks the tax estimate against hand-worked examples.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./source.cjs');
const data = source.slice(source.indexOf('const TAX_YEARS'), source.indexOf('// Newest first.'));
const calc = source.slice(source.indexOf('function calculateOrdinaryTax'), source.indexOf('function resetTaxCalculator'));
const box = {};
vm.createContext(box);
vm.runInContext(`${data}\n${calc}\nthis.TAX_YEARS = TAX_YEARS; this.computeTaxEstimate = computeTaxEstimate;`, box);
const run = (year, input) => box.computeTaxEstimate({ filingStatus: 'single', ...input }, box.TAX_YEARS[year]);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.02, `${label}: got ${actual}, want ${expected}`);

// Plain wages.
let r = run(2025, { wages: 60000 });
near(r.taxableIncome, 44250, 'A taxable');
near(r.incomeTaxBeforeCredits, 5071.5, 'A tax');
r = run(2024, { wages: 60000 });
near(r.incomeTaxBeforeCredits, 5216, '2024 tax');

// Married couple both 66: extra standard deduction plus the senior deduction.
r = run(2025, { filingStatus: 'mfj', interest: 80000, age65Count: 2 });
near(r.standardDeduction, 34700, 'B standard');
near(r.seniorDeduction, 12000, 'B senior');
near(r.taxableIncome, 33300, 'B taxable');
near(r.netInvestmentIncomeTax, 0, 'B NIIT');

// Senior deduction phaseout: 6% over $75,000.
r = run(2025, { interest: 100000, age65Count: 1 });
near(r.seniorDeduction, 4500, 'C senior');
near(r.taxableIncome, 77750, 'C taxable');

// Net Investment Income Tax.
r = run(2025, { wages: 250000, interest: 30000 });
near(r.netInvestmentIncomeTax, 1140, 'D NIIT');

// QBI below the threshold, limited by taxable income.
r = run(2025, { selfEmployment: 50000 });
near(r.selfEmploymentTax, 7064.78, 'E SE tax');
near(r.qbiDeduction, 6143.52, 'E QBI');
near(r.taxableIncome, 24574.09, 'E taxable');

// QBI fully phased out above threshold + range (no W-2 payroll assumed).
r = run(2025, { selfEmployment: 400000 });
near(r.qbiDeduction, 0, 'QBI phased out');
assert.ok(r.notes.some(n => n.includes('QBI')));

// 2026 minimum QBI deduction of $400.
r = run(2026, { wages: 400000, selfEmployment: 2000 });
near(r.qbiDeduction, 400, '2026 QBI minimum');

// Tips deduction phaseout: $100 per $1,000 over $300,000 joint.
r = run(2025, { filingStatus: 'mfj', wages: 320000, tips: 30000 });
near(r.tipsDeduction, 23000, 'F tips');
r = run(2025, { filingStatus: 'mfs', wages: 50000, tips: 5000 });
near(r.tipsDeduction, 0, 'MFS tips');
r = run(2024, { wages: 50000, tips: 5000 });
near(r.tipsDeduction, 0, '2024 tips');
assert.ok(r.notes.some(n => n.includes('2025')));

// Qualified dividends at 0%.
r = run(2025, { wages: 30000, qualifiedDividends: 20000 });
near(r.capitalTax.zeroAmount, 20000, 'G 0% portion');
near(r.incomeTaxBeforeCredits, 1471.5, 'G tax');

// Credit for other dependents is nonrefundable.
r = run(2025, { wages: 60000, otherDependents: 1 });
near(r.childCredit.nonrefundableCredit, 500, 'H ODC');
near(r.childCredit.refundableCredit, 0, 'H no ACTC');

// Itemizing when it beats the standard deduction.
r = run(2025, { wages: 100000, itemizedDeductions: 20000 });
assert.equal(r.itemizing, true);
near(r.taxableIncome, 80000, 'itemized taxable');

// Safe harbor: 110% of last year when that is smaller than 90% of this year.
r = run(2025, { wages: 300000, priorYearTax: 10000, priorYearHighIncome: true });
near(r.safeHarborAnnual, 11000, 'safe harbor');
console.log('tax calculator tests passed');
