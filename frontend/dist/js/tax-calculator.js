// Federal tax calculator.

function selectedTaxYear() {
  const year = Number($('taxYear')?.value || latestTaxDataYear());
  return TAX_YEARS[year] ? year : latestTaxDataYear();
}

// Builds the year dropdown from TAX_YEARS so adding a year to tax-data.js is enough.
function populateTaxCalculatorYears() {
  const select = $('taxYear');
  const years = taxDataYears();
  if (!select || select.options.length === years.length) return;
  const current = select.value;
  select.replaceChildren(...years.map(y => new Option(String(y), String(y))));
  select.value = years.includes(Number(current)) ? current : String(years[0]);
}

function selectedTaxConfig() {
  return TAX_YEARS[selectedTaxYear()];
}

function updateTaxCalculatorYearUI() {
  const year = selectedTaxYear();
  const config = TAX_YEARS[year];
  const sourceTitle = config.sources?.title || `References used for this ${year} calculator`;
  const sourceText = config.sources?.text || '';

  $('taxCalculatorEyebrow').textContent = `TOOLS • TAX YEAR ${year}`;
  $('taxCalculatorTitle').textContent = `${year} Federal Tax Calculator`;
  $('taxCalculatorDescription').textContent = `Estimate ${year} federal tax for planning: income tax with ${year} brackets and deductions, capital gains and dividends, self-employment tax, credits for children and dependents, and quarterly payments.`;
  $('taxIncomeHeading').textContent = `${year} income`;
  $('taxCalculatorCalculate').textContent = `Calculate ${year} Estimate`;
  $('taxResultYearLabel').textContent = `Estimated ${year} federal tax`;
  $('taxSourcesTitle').textContent = sourceTitle;
  $('taxSourcesText').textContent = sourceText;
  $('taxSourcesNote').textContent = `Standard deduction: ${taxCurrency(config.standardDeduction.single)} Single/MFS; ${taxCurrency(config.standardDeduction.mfj)} MFJ/QSS; ${taxCurrency(config.standardDeduction.hoh)} Head of Household. Child Tax Credit: up to ${taxCurrency(config.childTaxCredit.perChild)} per qualifying child, with up to ${taxCurrency(config.childTaxCredit.refundablePerChild)} potentially refundable through the ACTC. Estimated-tax due dates: ${config.estimatedTaxDueDates.join(' • ')}. Social Security wage base used for SE tax: ${taxCurrency(config.socialSecurityWageBase)}.`;
  $('taxCTCHint').innerHTML = `For ${year}, the maximum Child Tax Credit is <strong>${taxCurrency(config.childTaxCredit.perChild)} per qualifying child</strong>, with up to <strong>${taxCurrency(config.childTaxCredit.refundablePerChild)} per child</strong> potentially refundable as the Additional Child Tax Credit. Other dependents can bring a ${taxCurrency(config.childTaxCredit.otherDependent || 500)} credit. Both phase out above $400,000 for married filing jointly and $200,000 for other filing statuses.`;
  updateTaxCalculatorFieldAvailability();
  $('taxCalculatorResults').classList.add('hidden');
}

function showTaxCalculator() {
  populateTaxCalculatorYears();
  updateTaxCalculatorYearUI();
  $('taxCalculatorBackdrop').classList.remove('hidden');
  setTimeout(() => $('taxYear')?.focus(), 20);
}

function hideTaxCalculator() {
  $('taxCalculatorBackdrop').classList.add('hidden');
}


function taxNumber(id) {
  const raw = String($(id)?.value ?? '').replace(/[$,\s]/g, '');
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Enter a valid amount for ${$(id)?.closest('label')?.querySelector('span')?.textContent || id}.`);
  return value;
}

function taxCurrency(value) {
  const n = Math.abs(value) < .005 ? 0 : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function taxPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function calculateOrdinaryTax(income, filingStatus, config) {
  const taxable = Math.max(0, income);
  const brackets = config.ordinaryBrackets[filingStatus];
  let tax = 0;
  let previous = 0;
  let marginalRate = 0;
  for (const [limit, rate] of brackets) {
    if (taxable <= previous) break;
    const slice = Math.min(taxable, limit) - previous;
    if (slice > 0) {
      tax += slice * rate;
      marginalRate = rate;
    }
    if (taxable <= limit) break;
    previous = limit;
  }
  return { tax, marginalRate };
}

function classifyCapitalItems(shortTerm, longTerm, filingStatus, config) {
  let ordinaryGain = 0;
  let preferentialGain = 0;
  let lossDeduction = 0;
  let unusedLoss = 0;
  const lossLimit = config.capitalLossLimit[filingStatus];

  if (shortTerm >= 0 && longTerm >= 0) {
    ordinaryGain = shortTerm;
    preferentialGain = longTerm;
  } else {
    const net = shortTerm + longTerm;
    if (shortTerm < 0 && longTerm >= 0 && net > 0) {
      preferentialGain = net;
    } else if (shortTerm >= 0 && longTerm < 0 && net > 0) {
      ordinaryGain = net;
    } else if (net < 0) {
      const totalLoss = Math.abs(net);
      lossDeduction = Math.min(totalLoss, lossLimit);
      unusedLoss = Math.max(0, totalLoss - lossDeduction);
    }
  }

  return { ordinaryGain, preferentialGain, lossDeduction, unusedLoss };
}

function calculateLongTermCapitalTax(longTermTaxable, ordinaryTaxable, filingStatus, config) {
  let remaining = Math.max(0, longTermTaxable);
  let position = Math.max(0, ordinaryTaxable);
  const thresholds = config.capitalGains[filingStatus];

  const zeroAmount = Math.min(remaining, Math.max(0, thresholds.zeroMax - position));
  remaining -= zeroAmount;
  position += zeroAmount;

  const fifteenAmount = Math.min(remaining, Math.max(0, thresholds.fifteenMax - position));
  remaining -= fifteenAmount;
  const twentyAmount = Math.max(0, remaining);

  return {
    zeroAmount,
    fifteenAmount,
    twentyAmount,
    tax: fifteenAmount * .15 + twentyAmount * .20,
  };
}

function calculateChildTaxCredit({ children, otherDependents = 0, adjustedGrossIncome, incomeTax, earnedIncome, filingStatus, config }) {
  const rules = config.childTaxCredit;
  const count = Math.max(0, Math.floor(children));
  const others = Math.max(0, Math.floor(otherDependents));
  const earnedIncomeAmount = Math.max(0, earnedIncome);
  if (!count && !others) {
    return {
      maximumCredit: 0,
      phaseoutReduction: 0,
      creditAfterPhaseout: 0,
      nonrefundableCredit: 0,
      refundableCredit: 0,
      earnedIncomeAmount,
    };
  }

  // Schedule 8812: the Child Tax Credit and the $500 credit for other
  // dependents share one phaseout of $50 per $1,000 (or part of $1,000).
  const maximumCredit = count * rules.perChild + others * (rules.otherDependent || 0);
  const phaseoutThreshold = rules.phaseoutThreshold[filingStatus];
  const excessMAGI = Math.max(0, adjustedGrossIncome - phaseoutThreshold);
  const phaseoutReduction = excessMAGI > 0 ? Math.ceil(excessMAGI / 1000) * 50 : 0;
  const creditAfterPhaseout = Math.max(0, maximumCredit - phaseoutReduction);

  // The regular credit is nonrefundable and limited by income tax before credits.
  const nonrefundableCredit = Math.min(creditAfterPhaseout, Math.max(0, incomeTax));
  const unusedCredit = Math.max(0, creditAfterPhaseout - nonrefundableCredit);

  // Simplified ACTC estimate using the Schedule 8812 earned-income method.
  // Only qualifying children count toward the refundable cap. The special
  // alternative calculation for some taxpayers with 3+ children is not modeled.
  const earnedIncomeFormula = Math.max(0, earnedIncomeAmount - rules.earnedIncomeThreshold) * .15;
  const refundableCredit = Math.min(
    unusedCredit,
    count * rules.refundablePerChild,
    earnedIncomeFormula,
  );

  return {
    maximumCredit,
    phaseoutReduction,
    creditAfterPhaseout,
    nonrefundableCredit,
    refundableCredit,
    earnedIncomeAmount,
  };
}

// $100 off for each full $1,000 of MAGI over the threshold (tips and overtime).
function phasedDeduction(amount, magi, threshold) {
  if (!(amount > 0)) return 0;
  const reduction = Math.floor(Math.max(0, magi - threshold) / 1000) * 100;
  return Math.max(0, amount - reduction);
}

// Qualified business income deduction for a sole proprietor. Below the
// threshold it is 20% of QBI, capped at 20% of taxable income less net
// capital gain. Across the phase-in range it shrinks to zero, which is the
// result for a business with no W-2 payroll or depreciable property and for
// any specified service business. Above the range it is zero for those cases.
function calculateQBIDeduction({ qbi, taxableBeforeQBI, netCapitalGain, filingStatus, config }) {
  const rules = config.qbi;
  if (!rules || !(qbi > 0)) return { deduction: 0, limited: false };
  const tentative = qbi * .20;
  const incomeLimit = Math.max(0, taxableBeforeQBI - netCapitalGain) * .20;
  let deduction = Math.min(tentative, incomeLimit);
  const threshold = rules.threshold[filingStatus];
  const range = rules.phaseInRange[filingStatus];
  let limited = false;
  if (taxableBeforeQBI > threshold) {
    limited = true;
    const share = Math.min(1, (taxableBeforeQBI - threshold) / range);
    deduction = Math.min(incomeLimit, tentative * (1 - share));
  }
  if (rules.minimumDeduction && qbi >= rules.minimumActiveQBI) {
    deduction = Math.max(deduction, rules.minimumDeduction);
  }
  return { deduction: Math.max(0, deduction), limited };
}

// The whole estimate as plain numbers, so it can be checked by tests.
function computeTaxEstimate(input, config) {
  const filingStatus = input.filingStatus;
  const married = filingStatus === 'mfj' || filingStatus === 'mfs' || filingStatus === 'qss';
  const wages = input.wages || 0;
  const selfEmployment = input.selfEmployment || 0;
  const interest = input.interest || 0;
  const qualifiedDividends = Math.max(0, input.qualifiedDividends || 0);
  const capital = classifyCapitalItems(input.shortCapital || 0, input.longCapital || 0, filingStatus, config);

  // Schedule SE generally applies the 92.35% factor to positive net SE profit.
  const seNetEarnings = selfEmployment > 0 ? selfEmployment * .9235 : 0;
  const seTaxApplies = seNetEarnings >= 400;
  const socialSecurityRoom = Math.max(0, config.socialSecurityWageBase - Math.max(0, wages));
  const seSocialSecurityBase = seTaxApplies ? Math.min(seNetEarnings, socialSecurityRoom) : 0;
  const seSocialSecurityTax = seSocialSecurityBase * .124;
  const seMedicareTax = seTaxApplies ? seNetEarnings * .029 : 0;
  const selfEmploymentTax = seSocialSecurityTax + seMedicareTax;
  const halfSETaxDeduction = selfEmploymentTax * .5;

  const additionalMedicareThreshold = config.additionalMedicareThreshold[filingStatus];
  const additionalMedicareTax = Math.max(0, Math.max(0, wages) + seNetEarnings - additionalMedicareThreshold) * .009;

  const ordinaryIncome = wages + selfEmployment + interest + capital.ordinaryGain - capital.lossDeduction - halfSETaxDeduction;
  const preferentialIncome = capital.preferentialGain + qualifiedDividends;
  const adjustedGrossIncome = ordinaryIncome + preferentialIncome;

  // Standard deduction, plus the extra amount for each box checked for age
  // 65+ or blindness, unless itemizing gives more.
  const age65Count = Math.max(0, Math.min(married && filingStatus !== 'qss' ? 2 : 1, Math.floor(input.age65Count || 0)));
  const blindCount = Math.max(0, Math.min(married && filingStatus !== 'qss' ? 2 : 1, Math.floor(input.blindCount || 0)));
  const extraPerBox = config.additionalStandardDeduction ? (married ? config.additionalStandardDeduction.married : config.additionalStandardDeduction.unmarried) : 0;
  const standardDeduction = config.standardDeduction[filingStatus] + (age65Count + blindCount) * extraPerBox;
  const itemizedDeductions = Math.max(0, input.itemizedDeductions || 0);
  const itemizing = itemizedDeductions > standardDeduction;
  const baseDeduction = itemizing ? itemizedDeductions : standardDeduction;

  // 2025-2028 deductions. Married people must file jointly to claim them.
  const notes = [];
  let seniorDeduction = 0;
  let tipsDeduction = 0;
  let overtimeDeduction = 0;
  if (filingStatus === 'mfs' && (config.seniorDeduction || config.tipsDeduction) && (age65Count || input.tips || input.overtime)) {
    notes.push('The senior, tips and overtime deductions need a joint return when married, so they are not applied for married filing separately.');
  }
  if (filingStatus !== 'mfs') {
    if (config.seniorDeduction && age65Count) {
      const rules = config.seniorDeduction;
      const full = age65Count * rules.perPerson;
      seniorDeduction = Math.max(0, full - Math.max(0, adjustedGrossIncome - rules.phaseoutStart[filingStatus]) * rules.phaseoutRate);
    }
    if (config.tipsDeduction && input.tips > 0) {
      tipsDeduction = phasedDeduction(Math.min(input.tips, config.tipsDeduction.max), adjustedGrossIncome, config.tipsDeduction.phaseoutStart[filingStatus]);
    }
    if (config.overtimeDeduction && input.overtime > 0) {
      overtimeDeduction = phasedDeduction(Math.min(input.overtime, config.overtimeDeduction.max[filingStatus]), adjustedGrossIncome, config.overtimeDeduction.phaseoutStart[filingStatus]);
    }
  }
  if (!config.tipsDeduction && (input.tips > 0 || input.overtime > 0)) {
    notes.push('The tips and overtime deductions start in 2025, so they are not applied for this year.');
  }

  const taxableBeforeQBI = Math.max(0, adjustedGrossIncome - baseDeduction - seniorDeduction - tipsDeduction - overtimeDeduction);
  const qbi = calculateQBIDeduction({
    qbi: Math.max(0, selfEmployment - halfSETaxDeduction),
    taxableBeforeQBI,
    netCapitalGain: preferentialIncome,
    filingStatus,
    config,
  });
  if (qbi.limited) notes.push('Taxable income is above the QBI threshold, so the QBI deduction assumes no W-2 payroll or business property and is reduced or eliminated. A business with employees may qualify for more.');
  const qbiDeduction = qbi.deduction;
  const totalDeductions = baseDeduction + seniorDeduction + tipsDeduction + overtimeDeduction + qbiDeduction;
  const taxableIncome = Math.max(0, adjustedGrossIncome - totalDeductions);
  const ordinaryTaxableIncome = Math.max(0, Math.min(taxableIncome, ordinaryIncome - totalDeductions));
  const longTermTaxableIncome = Math.max(0, taxableIncome - ordinaryTaxableIncome);

  const ordinary = calculateOrdinaryTax(ordinaryTaxableIncome, filingStatus, config);
  const capitalTax = calculateLongTermCapitalTax(longTermTaxableIncome, ordinaryTaxableIncome, filingStatus, config);
  const incomeTaxBeforeCredits = ordinary.tax + capitalTax.tax;

  // Net Investment Income Tax (Form 8960): 3.8% of the smaller of investment
  // income or MAGI over the threshold. Interest here includes ordinary dividends.
  const netInvestmentIncome = Math.max(0, interest) + qualifiedDividends + Math.max(0, (input.shortCapital || 0) + (input.longCapital || 0));
  const niitThreshold = config.netInvestmentIncomeThreshold ? config.netInvestmentIncomeThreshold[filingStatus] : Infinity;
  const netInvestmentIncomeTax = Math.min(netInvestmentIncome, Math.max(0, adjustedGrossIncome - niitThreshold)) * .038;

  // Approximate Schedule 8812 earned income from the fields this planning calculator collects.
  const earnedIncomeForACTC = Math.max(0, Math.max(0, wages) + selfEmployment - halfSETaxDeduction);
  const childCredit = calculateChildTaxCredit({
    children: input.qualifyingChildren || 0,
    otherDependents: input.otherDependents || 0,
    adjustedGrossIncome,
    incomeTax: incomeTaxBeforeCredits,
    earnedIncome: earnedIncomeForACTC,
    filingStatus,
    config,
  });

  const incomeTaxAfterCTC = Math.max(0, incomeTaxBeforeCredits - childCredit.nonrefundableCredit);
  const totalFederalTax = incomeTaxAfterCTC + selfEmploymentTax + additionalMedicareTax + netInvestmentIncomeTax - childCredit.refundableCredit;
  const federalWithholding = Math.max(0, input.federalWithholding || 0);
  const estimatedTaxToCover = Math.max(0, totalFederalTax - federalWithholding);
  const equalQuarterlyPayment = estimatedTaxToCover / 4;

  // Form 1040-ES safe harbor: pay the smaller of 90% of this year's tax or
  // 100% of last year's (110% if last year's AGI was over $150,000, or
  // $75,000 married filing separately).
  const priorYearTax = Math.max(0, input.priorYearTax || 0);
  const priorYearFactor = input.priorYearHighIncome ? 1.1 : 1;
  const safeHarborAnnual = priorYearTax > 0
    ? Math.min(Math.max(0, totalFederalTax) * .9, priorYearTax * priorYearFactor)
    : Math.max(0, totalFederalTax) * .9;
  const safeHarborToCover = Math.max(0, safeHarborAnnual - federalWithholding);

  return {
    adjustedGrossIncome, standardDeduction, itemizedDeductions, itemizing, baseDeduction,
    seniorDeduction, tipsDeduction, overtimeDeduction, qbiDeduction, taxableIncome,
    ordinary, capitalTax, capital, incomeTaxBeforeCredits, childCredit, incomeTaxAfterCTC,
    selfEmploymentTax, halfSETaxDeduction, additionalMedicareTax, netInvestmentIncomeTax,
    totalFederalTax, federalWithholding, estimatedTaxToCover, equalQuarterlyPayment,
    priorYearTax, priorYearFactor, safeHarborAnnual, safeHarborToCover, notes,
  };
}

function resetTaxCalculator() {
  $('taxFilingStatus').value = 'single';
  TAX_INPUT_IDS.forEach(id => { $(id).value = '0'; });
  $('taxPriorYearHighIncome').checked = false;
  $('taxCalculatorResults').classList.add('hidden');
  updateTaxCalculatorFieldAvailability();
  $('taxWages').focus();
}

const TAX_INPUT_IDS = ['taxWages', 'taxSelfEmployment', 'taxInterest', 'taxQualifiedDividends', 'taxShortCapital', 'taxLongCapital', 'taxFederalWithholding', 'taxQualifyingChildren', 'taxOtherDependents', 'taxItemized', 'taxAge65', 'taxBlind', 'taxTips', 'taxOvertime', 'taxPriorYearTax'];

// Hides inputs that don't apply to the chosen year.
function updateTaxCalculatorFieldAvailability() {
  const config = selectedTaxConfig();
  const obbba = Boolean(config.tipsDeduction);
  $('taxTipsField').classList.toggle('hidden', !obbba);
  $('taxOvertimeField').classList.toggle('hidden', !obbba);
}

function wholeCount(id, label) {
  const value = taxNumber(id);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Enter a whole number (0 or more) for ${label}.`);
  return value;
}

function calculateTaxEstimate() {
  const year = selectedTaxYear();
  const config = TAX_YEARS[year];
  const federalWithholding = taxNumber('taxFederalWithholding');
  if (federalWithholding < 0) throw new Error('Federal withholding cannot be negative.');
  for (const [id, label] of [['taxItemized', 'itemized deductions'], ['taxTips', 'qualified tips'], ['taxOvertime', 'qualified overtime'], ['taxPriorYearTax', 'last year’s total tax'], ['taxQualifiedDividends', 'qualified dividends']]) {
    if (taxNumber(id) < 0) throw new Error(`Enter ${label} as a positive amount.`);
  }
  const r = computeTaxEstimate({
    filingStatus: $('taxFilingStatus').value,
    wages: taxNumber('taxWages'),
    selfEmployment: taxNumber('taxSelfEmployment'),
    interest: taxNumber('taxInterest'),
    qualifiedDividends: taxNumber('taxQualifiedDividends'),
    shortCapital: taxNumber('taxShortCapital'),
    longCapital: taxNumber('taxLongCapital'),
    federalWithholding,
    qualifyingChildren: wholeCount('taxQualifyingChildren', 'qualifying children'),
    otherDependents: wholeCount('taxOtherDependents', 'other dependents'),
    itemizedDeductions: taxNumber('taxItemized'),
    age65Count: wholeCount('taxAge65', 'people age 65 or older'),
    blindCount: wholeCount('taxBlind', 'people who are blind'),
    tips: taxNumber('taxTips'),
    overtime: taxNumber('taxOvertime'),
    priorYearTax: taxNumber('taxPriorYearTax'),
    priorYearHighIncome: $('taxPriorYearHighIncome').checked,
  }, config);

  const paren = v => v ? `(${taxCurrency(v)})` : '$0';
  $('taxResultTotal').textContent = taxCurrency(r.totalFederalTax);
  $('taxResultAGI').textContent = taxCurrency(r.adjustedGrossIncome);
  $('taxResultDeductionLabel').textContent = r.itemizing ? 'Itemized deductions' : 'Standard deduction';
  $('taxResultStandardDeduction').textContent = taxCurrency(r.baseDeduction);
  $('taxResultTaxableIncome').textContent = taxCurrency(r.taxableIncome);
  $('taxResultMarginalRate').textContent = taxPercent(r.ordinary.marginalRate);
  $('taxResultSeniorDeduction').textContent = paren(r.seniorDeduction);
  $('taxResultTipsDeduction').textContent = paren(r.tipsDeduction);
  $('taxResultOvertimeDeduction').textContent = paren(r.overtimeDeduction);
  $('taxResultQBI').textContent = paren(r.qbiDeduction);
  $('taxResultOrdinaryTax').textContent = taxCurrency(r.ordinary.tax);
  $('taxResultCapitalTax').textContent = taxCurrency(r.capitalTax.tax);
  $('taxResultIncomeTaxBeforeCredits').textContent = taxCurrency(r.incomeTaxBeforeCredits);
  $('taxResultCTCMaximum').textContent = taxCurrency(r.childCredit.maximumCredit);
  $('taxResultCTCPhaseout').textContent = r.childCredit.phaseoutReduction ? `(${taxCurrency(r.childCredit.phaseoutReduction)})` : '$0';
  $('taxResultCTC').textContent = paren(r.childCredit.nonrefundableCredit);
  $('taxResultACTC').textContent = paren(r.childCredit.refundableCredit);
  $('taxResultIncomeTaxAfterCTC').textContent = taxCurrency(r.incomeTaxAfterCTC);
  $('taxResultSETax').textContent = taxCurrency(r.selfEmploymentTax);
  $('taxResultAdditionalMedicare').textContent = taxCurrency(r.additionalMedicareTax);
  $('taxResultNIIT').textContent = taxCurrency(r.netInvestmentIncomeTax);
  $('taxResultHalfSE').textContent = `(${taxCurrency(r.halfSETaxDeduction)})`;
  $('taxResultCapitalLossDeduction').textContent = paren(r.capital.lossDeduction);
  $('taxResultCapitalLossCarryforward').textContent = taxCurrency(r.capital.unusedLoss);
  $('taxResultCG0').textContent = taxCurrency(r.capitalTax.zeroAmount);
  $('taxResultCG15').textContent = taxCurrency(r.capitalTax.fifteenAmount);
  $('taxResultCG20').textContent = taxCurrency(r.capitalTax.twentyAmount);
  $('taxResultFederalWithholding').textContent = paren(r.federalWithholding);
  $('taxResultEstimatedTaxToCover').textContent = taxCurrency(r.estimatedTaxToCover);
  $('taxResultQuarterlyPayment').textContent = taxCurrency(r.equalQuarterlyPayment);
  $('taxResultSafeHarbor').textContent = taxCurrency(r.safeHarborToCover / 4);
  $('taxResultSafeHarborNote').textContent = r.priorYearTax > 0
    ? `The smaller of 90% of this year's tax (${taxCurrency(r.totalFederalTax * .9)}) or ${r.priorYearFactor > 1 ? '110' : '100'}% of last year's (${taxCurrency(r.priorYearTax * r.priorYearFactor)}), less withholding, in four payments.`
    : `90% of this year's tax, less withholding, in four payments. Enter last year's total tax to compare with the prior-year safe harbor.`;
  config.estimatedTaxDueDates.forEach((date, index) => {
    const n = index + 1;
    $(`taxQuarter${n}Date`).textContent = date;
    $(`taxQuarter${n}Amount`).textContent = taxCurrency(r.equalQuarterlyPayment);
  });
  const notes = $('taxResultNotes');
  notes.replaceChildren(...r.notes.map(text => Object.assign(document.createElement('p'), { textContent: text })));
  notes.classList.toggle('hidden', r.notes.length === 0);
  $('taxResultYearLabel').textContent = `Estimated ${year} federal tax after credits`;
  $('taxCalculatorResults').classList.remove('hidden');
  $('taxCalculatorResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
