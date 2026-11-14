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
  $('taxCalculatorDescription').textContent = `Estimate ${year} federal income tax using the standard deduction, ${year} tax brackets, capital-gain rates, and self-employment tax rules.`;
  $('taxIncomeHeading').textContent = `${year} income`;
  $('taxCalculatorCalculate').textContent = `Calculate ${year} Estimate`;
  $('taxResultYearLabel').textContent = `Estimated ${year} federal tax`;
  $('taxSourcesTitle').textContent = sourceTitle;
  $('taxSourcesText').textContent = sourceText;
  $('taxSourcesNote').textContent = `Standard deduction: ${taxCurrency(config.standardDeduction.single)} Single/MFS; ${taxCurrency(config.standardDeduction.mfj)} MFJ/QSS; ${taxCurrency(config.standardDeduction.hoh)} Head of Household. Child Tax Credit: up to ${taxCurrency(config.childTaxCredit.perChild)} per qualifying child, with up to ${taxCurrency(config.childTaxCredit.refundablePerChild)} potentially refundable through the ACTC. Estimated-tax due dates: ${config.estimatedTaxDueDates.join(' • ')}. Social Security wage base used for SE tax: ${taxCurrency(config.socialSecurityWageBase)}.`;
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

function calculateChildTaxCredit({ children, adjustedGrossIncome, incomeTax, earnedIncome, filingStatus, config }) {
  const rules = config.childTaxCredit;
  const count = Math.max(0, Math.floor(children));
  if (!count) {
    return {
      maximumCredit: 0,
      phaseoutReduction: 0,
      creditAfterPhaseout: 0,
      nonrefundableCredit: 0,
      refundableCredit: 0,
      earnedIncomeAmount: Math.max(0, earnedIncome),
    };
  }

  const maximumCredit = count * rules.perChild;
  const phaseoutThreshold = rules.phaseoutThreshold[filingStatus];
  const excessMAGI = Math.max(0, adjustedGrossIncome - phaseoutThreshold);
  const phaseoutReduction = excessMAGI > 0 ? Math.ceil(excessMAGI / 1000) * 50 : 0;
  const creditAfterPhaseout = Math.max(0, maximumCredit - phaseoutReduction);

  // The regular CTC is nonrefundable and limited by income tax before credits.
  const nonrefundableCredit = Math.min(creditAfterPhaseout, Math.max(0, incomeTax));
  const unusedCredit = Math.max(0, creditAfterPhaseout - nonrefundableCredit);

  // Simplified ACTC estimate using the Schedule 8812 earned-income method.
  // The special alternative calculation for some taxpayers with 3+ children is not modeled.
  const earnedIncomeAmount = Math.max(0, earnedIncome);
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

function resetTaxCalculator() {
  $('taxFilingStatus').value = 'single';
  ['taxWages', 'taxSelfEmployment', 'taxInterest', 'taxShortCapital', 'taxLongCapital', 'taxFederalWithholding', 'taxQualifyingChildren'].forEach(id => { $(id).value = '0'; });
  $('taxCalculatorResults').classList.add('hidden');
  $('taxWages').focus();
}

function calculateTaxEstimate() {
  const year = selectedTaxYear();
  const config = TAX_YEARS[year];
  const filingStatus = $('taxFilingStatus').value;
  const wages = taxNumber('taxWages');
  const selfEmployment = taxNumber('taxSelfEmployment');
  const interest = taxNumber('taxInterest');
  const shortCapital = taxNumber('taxShortCapital');
  const longCapital = taxNumber('taxLongCapital');
  const federalWithholding = taxNumber('taxFederalWithholding');
  if (federalWithholding < 0) throw new Error('Federal withholding cannot be negative.');
  const qualifyingChildrenRaw = taxNumber('taxQualifyingChildren');
  if (!Number.isInteger(qualifyingChildrenRaw) || qualifyingChildrenRaw < 0) throw new Error('Enter a whole number of qualifying children (0 or more).');
  const qualifyingChildren = qualifyingChildrenRaw;

  const capital = classifyCapitalItems(shortCapital, longCapital, filingStatus, config);

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

  const ordinaryIncomeBeforeStandardDeduction =
    wages + selfEmployment + interest + capital.ordinaryGain - capital.lossDeduction - halfSETaxDeduction;
  const adjustedGrossIncome = ordinaryIncomeBeforeStandardDeduction + capital.preferentialGain;
  const standardDeduction = config.standardDeduction[filingStatus];
  const taxableIncome = Math.max(0, adjustedGrossIncome - standardDeduction);
  const ordinaryTaxableIncome = Math.max(0, Math.min(taxableIncome, ordinaryIncomeBeforeStandardDeduction - standardDeduction));
  const longTermTaxableIncome = Math.max(0, taxableIncome - ordinaryTaxableIncome);

  const ordinary = calculateOrdinaryTax(ordinaryTaxableIncome, filingStatus, config);
  const capitalTax = calculateLongTermCapitalTax(longTermTaxableIncome, ordinaryTaxableIncome, filingStatus, config);
  const incomeTaxBeforeCredits = ordinary.tax + capitalTax.tax;

  // Approximate Schedule 8812 earned income from the fields this planning calculator collects.
  const earnedIncomeForACTC = Math.max(0, Math.max(0, wages) + selfEmployment - halfSETaxDeduction);
  const childCredit = calculateChildTaxCredit({
    children: qualifyingChildren,
    adjustedGrossIncome,
    incomeTax: incomeTaxBeforeCredits,
    earnedIncome: earnedIncomeForACTC,
    filingStatus,
    config,
  });

  const incomeTaxAfterCTC = Math.max(0, incomeTaxBeforeCredits - childCredit.nonrefundableCredit);
  const totalFederalTax = incomeTaxAfterCTC + selfEmploymentTax + additionalMedicareTax - childCredit.refundableCredit;
  const estimatedTaxToCover = Math.max(0, totalFederalTax - federalWithholding);
  const equalQuarterlyPayment = estimatedTaxToCover / 4;

  $('taxResultTotal').textContent = taxCurrency(totalFederalTax);
  $('taxResultAGI').textContent = taxCurrency(adjustedGrossIncome);
  $('taxResultStandardDeduction').textContent = taxCurrency(standardDeduction);
  $('taxResultTaxableIncome').textContent = taxCurrency(taxableIncome);
  $('taxResultMarginalRate').textContent = taxPercent(ordinary.marginalRate);
  $('taxResultOrdinaryTax').textContent = taxCurrency(ordinary.tax);
  $('taxResultCapitalTax').textContent = taxCurrency(capitalTax.tax);
  $('taxResultIncomeTaxBeforeCredits').textContent = taxCurrency(incomeTaxBeforeCredits);
  $('taxResultCTCMaximum').textContent = taxCurrency(childCredit.maximumCredit);
  $('taxResultCTCPhaseout').textContent = childCredit.phaseoutReduction ? `(${taxCurrency(childCredit.phaseoutReduction)})` : '$0';
  $('taxResultCTC').textContent = childCredit.nonrefundableCredit ? `(${taxCurrency(childCredit.nonrefundableCredit)})` : '$0';
  $('taxResultACTC').textContent = childCredit.refundableCredit ? `(${taxCurrency(childCredit.refundableCredit)})` : '$0';
  $('taxResultIncomeTaxAfterCTC').textContent = taxCurrency(incomeTaxAfterCTC);
  $('taxResultSETax').textContent = taxCurrency(selfEmploymentTax);
  $('taxResultAdditionalMedicare').textContent = taxCurrency(additionalMedicareTax);
  $('taxResultHalfSE').textContent = `(${taxCurrency(halfSETaxDeduction)})`;
  $('taxResultCapitalLossDeduction').textContent = capital.lossDeduction ? `(${taxCurrency(capital.lossDeduction)})` : '$0';
  $('taxResultCapitalLossCarryforward').textContent = taxCurrency(capital.unusedLoss);
  $('taxResultCG0').textContent = taxCurrency(capitalTax.zeroAmount);
  $('taxResultCG15').textContent = taxCurrency(capitalTax.fifteenAmount);
  $('taxResultCG20').textContent = taxCurrency(capitalTax.twentyAmount);
  $('taxResultFederalWithholding').textContent = federalWithholding ? `(${taxCurrency(federalWithholding)})` : '$0';
  $('taxResultEstimatedTaxToCover').textContent = taxCurrency(estimatedTaxToCover);
  $('taxResultQuarterlyPayment').textContent = taxCurrency(equalQuarterlyPayment);
  config.estimatedTaxDueDates.forEach((date, index) => {
    const n = index + 1;
    $(`taxQuarter${n}Date`).textContent = date;
    $(`taxQuarter${n}Amount`).textContent = taxCurrency(equalQuarterlyPayment);
  });
  $('taxResultYearLabel').textContent = `Estimated ${year} federal tax after CTC / ACTC`;
  $('taxCalculatorResults').classList.remove('hidden');
  $('taxCalculatorResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
