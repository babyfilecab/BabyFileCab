// Wires every button and input to its handler.

function wireEvents() {
  buildFirmCalendarStatusMenu();
  wireRecycleBin();
  wireInbox();
  wireBackups();
  wireUpdates();
  wireRetention();
  wireEncryptionCheck();
  wireWISP();
  $('documentVersionsList').addEventListener('click', e => call(() => handleDocumentVersionClick(e)));
  $('needsAttentionBtn').addEventListener('click', () => call(() => refreshNeedsAttention({ open: true })));
  $('needsAttentionClose').addEventListener('click', hideNeedsAttention);
  $('needsAttentionCloseTop').addEventListener('click', hideNeedsAttention);
  $('needsAttentionCalendar').addEventListener('click', () => { hideNeedsAttention(); call(showFirmCalendar); });
  $('needsAttentionList').addEventListener('click', e => {
    const button = e.target.closest('[data-needs-attention-index]');
    if (button) call(() => openNeedsAttentionItem(button.dataset.needsAttentionIndex));
  });
  $('needsAttentionBackdrop').addEventListener('keydown', e => { if (e.key === 'Escape') hideNeedsAttention(); });
  $('openFirmCalendarBtn').addEventListener('click', () => call(showFirmCalendar));
  $('timeSheetCloseTop').addEventListener('click', hideTimeSheet);
  $('timeSheetClose').addEventListener('click', hideTimeSheet);
  $('timeSheetDate').addEventListener('click', openTimeSheetCalendar);
  $('timeSheetDateOpen').addEventListener('click', openTimeSheetCalendar);
  $('timeSheetDate').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTimeSheetCalendar(); } });
  $('timeSheetCalendarPrev').addEventListener('click', () => moveTimeSheetCalendarMonth(-1));
  $('timeSheetCalendarNext').addEventListener('click', () => moveTimeSheetCalendarMonth(1));
  $('timeSheetCalendarCancel').addEventListener('click', closeTimeSheetCalendar);
  $('timeSheetDateConfirm').addEventListener('click', acceptTimeSheetCalendarDate);
  $('timeSheetCalendarPopover').addEventListener('click', e => e.stopPropagation());
  $('timeSheetAdd').addEventListener('click', addTimeSheetEntry);
  $('timeSheetTimerStart').addEventListener('click', startTimeSheetTimer);
  $('timeSheetTimerStop').addEventListener('click', stopTimeSheetTimer);
  $('timeSheetTimerDiscard').addEventListener('click', discardTimeSheetTimer);
  $('timerChip').addEventListener('click', () => call(showTimeSheet));
  ['timeSheetPeriod', 'timeSheetPerson', 'timeSheetClientFilter'].forEach(id => $(id).addEventListener('change', () => { updateTimeSheetDateStatus(); renderTimeSheet(); }));
  $('timeSheetExport').addEventListener('click', () => call(exportTimeSheet));
  $('timeSheetCancelEdit').addEventListener('click', () => cancelTimeSheetEdit());
  $('timeSheetHours').addEventListener('keydown', e => { if (e.key === 'Enter') addTimeSheetEntry(); });
  $('timeSheetRows').addEventListener('click', e => {
    const again=e.target.closest('[data-time-entry-repeat-id]'); if(again) { repeatTimeSheetEntry(again.dataset.timeEntryRepeatId); return; }
    const edit=e.target.closest('[data-time-entry-edit-id]'); if(edit) { editTimeSheetEntry(edit.dataset.timeEntryEditId); return; }
    const button=e.target.closest('[data-time-entry-id]'); if(button) deleteTimeSheetEntry(button.dataset.timeEntryId);
  });
  $('timeSheetBackdrop').addEventListener('click', e => { if(e.target===$('timeSheetBackdrop')) hideTimeSheet(); });
  $('calendarScheduleClientCancel').addEventListener('click',hideCalendarScheduleClient);
  $('calendarScheduleClientSave').addEventListener('click',saveCalendarScheduleClient);
  $('calendarScheduleClientBackdrop').addEventListener('click',e => {if(e.target===$('calendarScheduleClientBackdrop'))hideCalendarScheduleClient();});
  $('firmCalendarPreparerButton').addEventListener('click', () => {
    const menu=$('firmCalendarPreparerMenu'); menu.classList.toggle('hidden'); $('firmCalendarPreparerButton').setAttribute('aria-expanded',String(!menu.classList.contains('hidden')));
  });
  $('firmCalendarPreparerReassignCancel').addEventListener('click',hideCalendarPreparerReassign);
  $('firmCalendarPreparerReassignSave').addEventListener('click',saveCalendarPreparerReassign);
  $('firmCalendarPreparerReassignBackdrop').addEventListener('click',e => { if(e.target===$('firmCalendarPreparerReassignBackdrop')) hideCalendarPreparerReassign(); });
  $('shortcutMapperModify').addEventListener('click', () => showShortcutEditor(false));
  $('shortcutMapperClear').addEventListener('click', () => { if (shortcutSelectedRow) { shortcutDraft[shortcutSelectedRow.id].splice(shortcutSelectedRow.index,1); renderShortcutMapper(); } });
  $('shortcutEditCancel').addEventListener('click', () => { hideShortcutEditor(); $('shortcutMapperModify').focus(); });
  $('shortcutEditOK').addEventListener('click', applyShortcutEditor);
  ['Ctrl','Alt','Shift'].forEach(modifier => $(`shortcutEdit${modifier}`).addEventListener('change', updateShortcutEditorPreview));
  $('shortcutEditKey').addEventListener('change', updateShortcutEditorPreview);
  $('shortcutEditBackdrop').addEventListener('click', e => { if (e.target === $('shortcutEditBackdrop')) hideShortcutEditor(); });
  $('shortcutMapperCancel').addEventListener('click', hideShortcutMapper);
  $('shortcutMapperSave').addEventListener('click', saveShortcutMapper);
  $('shortcutMapperReset').addEventListener('click', () => { shortcutDraft = defaultShortcutBindings(); renderShortcutMapper(); });
  $('shortcutMapperBackdrop').addEventListener('click', e => { if (e.target === $('shortcutMapperBackdrop')) hideShortcutMapper(); });
  $('changePasswordCancel').addEventListener('click', hideChangePassword);
  $('changePasswordSave').addEventListener('click', changePassword);
  $('changeConfirmPassword').addEventListener('keydown', e => { if (e.key === 'Enter') changePassword(); });
  $('changePasswordBackdrop').addEventListener('click', e => { if (e.target === $('changePasswordBackdrop')) hideChangePassword(); });
  $('signInBtn').addEventListener('click', signIn);
  $('authUsername').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  $('authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  $('showCreateAccountBtn').addEventListener('click', showCreateAccount);
  $('showExistingCompanyUserBtn').addEventListener('click', showExistingCompanyUser);
  $('createAccountCancel').addEventListener('click', hideCreateAccount);
  $('createAccountSave').addEventListener('click', createAccount);
  $('createConfirmPassword').addEventListener('keydown', e => { if (e.key === 'Enter') createAccount(); });
  $('createAccountBackdrop').addEventListener('click', e => { if (e.target === $('createAccountBackdrop')) hideCreateAccount(); });
  $('existingCompanyUserCancel').addEventListener('click', hideExistingCompanyUser);
  $('existingCompanyUserSave').addEventListener('click', createExistingCompanyUser);
  $('existingAdminPassword').addEventListener('keydown', e => { if (e.key === 'Enter') createExistingCompanyUser(); });
  $('existingCompanyUserBackdrop').addEventListener('click', e => { if (e.target === $('existingCompanyUserBackdrop')) hideExistingCompanyUser(); });
  $('treeSearch').addEventListener('input', () => renderTree());
  $('appMenubar').addEventListener('click', e => {
    const trigger = e.target.closest('.menu-trigger[data-menu]');
    if (trigger) {
      e.stopPropagation();
      toggleAppMenu(trigger.dataset.menu);
      return;
    }
    const item = e.target.closest('[data-menu-action]');
    if (item) {
      e.stopPropagation();
      closeAppMenus();
      handleMenuAction(item.dataset.menuAction);
    }
  });
  $('toolbar').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (btn) doAction(btn.dataset.action);
  });
  $('clientContextMenu').addEventListener('click', e => {
    const btn = e.target.closest('button[data-client-action]');
    if (!btn || !contextClient) return;
    const action = btn.dataset.clientAction;
    const client = contextClient;
    hideAllContextMenus();
    selectNode(client);
    if (action === 'edit') doAction('edit-client');
    else if (action === 'delete') doAction('delete-client');
    else if (action === 'add-year') doAction('add-year');
    else if (action === 'add-section') doAction('add-section');
    else if (action === 'properties') showClientProperties(client);
  });
  $('taxYearContextMenu').addEventListener('click', e => {
    const btn = e.target.closest('button[data-taxyear-action]');
    if (!btn || !contextTaxYear) return;
    const action = btn.dataset.taxyearAction;
    const year = contextTaxYear;
    hideAllContextMenus();
    selectNode(year);
    if (action === 'edit') doAction('edit-year');
    else if (action === 'delete') doAction('delete-year');
    else if (action === 'add-section') doAction('add-section');
  });
  $('sectionContextMenu').addEventListener('click', e => {
    const btn = e.target.closest('button[data-section-action]');
    if (!btn || !contextSection) return;
    const action = btn.dataset.sectionAction;
    const section = contextSection;
    hideAllContextMenus();
    selectNode(section);
    if (action === 'edit') doAction('edit-section');
    else if (action === 'upload') doAction('upload');
    else if (action === 'delete') doAction('delete-section');
  });
  $('documentContextMenu').addEventListener('click', e => {
    const btn = e.target.closest('button[data-document-action]');
    if (!btn || !contextDocument) return;
    const action = btn.dataset.documentAction;
    const doc = contextDocument;
    hideAllContextMenus();
    selectNode(doc);
    if (action === 'edit') doAction('rename-file');
    else if (action === 'open') call(async () => backend().OpenFile(doc.path));
    else if (action === 'done') call(async () => {
      await backend().SetDocumentEnteredDone(doc.path, !Boolean(doc.done));
      await refreshTree(doc.path);
    });
    else if (action === 'delete') doAction('delete-file');
    else if (action === 'properties') showDocumentProperties(doc);
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.context-menu')) hideAllContextMenus();
    if (!e.target.closest('.app-menubar')) closeAppMenus();
  });
  window.addEventListener('blur', hideAllContextMenus);
  window.addEventListener('resize', hideAllContextMenus);
  $('propertiesClose').addEventListener('click', hideClientProperties);
  $('propertiesBackdrop').addEventListener('click', e => {
    if (e.target === $('propertiesBackdrop')) hideClientProperties();
  });
  $('documentPropertiesCancel').addEventListener('click', hideDocumentProperties);
  $('documentPropertiesSave').addEventListener('click', saveDocumentProperties);
  $('documentPropertiesBackdrop').addEventListener('click', e => {
    if (e.target === $('documentPropertiesBackdrop')) hideDocumentProperties();
  });
  $('globalFindClose').addEventListener('click', hideGlobalFind);
  $('globalFindBackdrop').addEventListener('click', e => {
    if (e.target === $('globalFindBackdrop')) hideGlobalFind();
  });
  $('globalFindSearch').addEventListener('click', runGlobalFind);
  $('globalFindInput').addEventListener('input', () => {
    clearTimeout(globalFindTimer);
    globalFindTimer = setTimeout(runGlobalFind, 220);
  });
  $('globalFindInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); runGlobalFind(); }
    if (e.key === 'Escape') hideGlobalFind();
  });
  $('globalFindResults').addEventListener('click', async e => {
    const row = e.target.closest('[data-global-path]');
    if (!row) return;
    const path = row.dataset.globalPath;
    hideGlobalFind();
    expandAncestors(path);
    await refreshTree(path);
  });
  $('clientPickerCancel').addEventListener('click', () => closeClientPicker(null));
  $('clientPickerBackdrop').addEventListener('click', e => { if (e.target === $('clientPickerBackdrop')) closeClientPicker(null); });
  $('clientPickerSearch').addEventListener('input', renderClientPickerList);
  $('clientPickerList').addEventListener('click', e => {
    const row = e.target.closest('[data-client-picker-path]');
    if (!row) return;
    closeClientPicker(findNodeByPath(row.dataset.clientPickerPath, clientPickerItems));
  });
  $('clientCommunicationsClose').addEventListener('click', hideClientCommunications);
  $('clientCommunicationsBackdrop').addEventListener('click', e => { if (e.target === $('clientCommunicationsBackdrop')) hideClientCommunications(); });
  $('clientCommunicationsSearch').addEventListener('input', renderClientCommunications);
  $('clientCommunicationsSearch').addEventListener('keydown', e => { if (e.key === 'Escape') hideClientCommunications(); });
  $('clientCommunicationsBody').addEventListener('click', async e => {
    const row = e.target.closest('[data-communications-path]');
    if (!row) return;
    const path = row.dataset.communicationsPath;
    hideClientCommunications();
    $('treeSearch').value = '';
    expandAncestors(path);
    await refreshTree(path);
  });
  $('addClientCancel').addEventListener('click', () => closeClientForm(null));
  $('addClientSave').addEventListener('click', () => submitClientForm());
  $('addClientBackdrop').addEventListener('click', e => { if (e.target === $('addClientBackdrop')) closeClientForm(null); });
  $('clientNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitClientForm(); });
  $('modalCancel').addEventListener('click', () => closeModal(null));
  $('modalOK').addEventListener('click', () => closeModal($('modalInput').value));
  $('modalInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') closeModal($('modalInput').value);
    if (e.key === 'Escape') closeModal(null);
  });
  $('userManualClose').addEventListener('click', hideUserManual);
  $('userManualCloseTop').addEventListener('click', hideUserManual);
  $('userManualBackdrop').addEventListener('click', e => { if (e.target === $('userManualBackdrop')) hideUserManual(); });
  $('aboutClose').addEventListener('click', hideAbout);
  $('aboutCloseTop').addEventListener('click', hideAbout);
  $('aboutBackdrop').addEventListener('click', e => { if (e.target === $('aboutBackdrop')) hideAbout(); });
  $('engagementLetterClose').addEventListener('click', hideEngagementLetter);
  $('engagementLetterCloseTop').addEventListener('click', hideEngagementLetter);
  $('engagementLetterBackdrop').addEventListener('click', e => { if (e.target === $('engagementLetterBackdrop')) hideEngagementLetter(); });
  $('engagementClient').addEventListener('change', () => call(async () => { await engagementSelectionChanged({ client: true }); }));
  $('engagementPreparer').addEventListener('change', () => engagementSelectionChanged({ preparer: true }));
  $('engagementService').addEventListener('change', () => call(async () => { await engagementSelectionChanged(); }));
  $('engagementTaxYear').addEventListener('change', () => call(async () => engagementSelectionChanged()));
  $('engagementFeeType').addEventListener('change', () => engagementSelectionChanged());
  $('engagementFeeValue').addEventListener('input', () => renderEngagementPreview());
  $('engagementDate').addEventListener('change', () => renderEngagementPreview());
  $('engagementBrowseLogo').addEventListener('click', () => call(browseEngagementFirmLogo));
  $('engagementRemoveLogo').addEventListener('click', () => call(removeEngagementFirmLogo));
  $('engagementGeneratePDF').addEventListener('click', () => generateEngagementLetter('pdf'));
  $('engagementGenerateWord').addEventListener('click', () => generateEngagementLetter('docx'));
  $('engagementEditWording').addEventListener('click', showEngagementWordingEditor);
  $('wordingCloseTop').addEventListener('click', hideEngagementWordingEditor);
  $('wordingCancel').addEventListener('click', hideEngagementWordingEditor);
  $('wordingSave').addEventListener('click', () => call(saveEngagementWording));
  $('wordingReset').addEventListener('click', resetEngagementWordingDraft);
  $('wordingAddSection').addEventListener('click', addEngagementWordingSection);
  $('wordingSections').addEventListener('click', e => {
    const button = e.target.closest('[data-wording-action]');
    if (button) engagementWordingAction(button.dataset.wordingAction, Number(button.closest('[data-wording-index]').dataset.wordingIndex));
  });
  $('invoiceClose').addEventListener('click', hideInvoiceGenerator);
  $('invoiceCloseTop').addEventListener('click', hideInvoiceGenerator);
  $('invoiceBackdrop').addEventListener('click', e => { if (e.target === $('invoiceBackdrop')) hideInvoiceGenerator(); });
  $('invoiceClient').addEventListener('change', () => call(async () => { await invoiceSelectionChanged({ client: true }); }));
  $('invoicePreparer').addEventListener('change', () => invoiceSelectionChanged({ preparer: true }));
  $('invoiceService').addEventListener('change', invoiceServiceChanged);
  $('invoiceTaxYear').addEventListener('change', invoiceServiceChanged);
  $('invoiceNumber').addEventListener('input', renderInvoicePreview);
  $('invoiceDate').addEventListener('change', renderInvoicePreview);
  $('invoiceDueDate').addEventListener('change', renderInvoicePreview);
  $('invoiceLines').addEventListener('input', e => {
    const row = e.target.closest('[data-invoice-line]');
    if (!row) return;
    if (e.target.classList.contains('invoice-line-desc')) delete invoiceLines[Number(row.dataset.invoiceLine)].autoDescription;
    invoiceLineEdited(row);
  });
  $('invoiceLines').addEventListener('click', e => {
    const button = e.target.closest('.invoice-line-remove');
    if (button) removeInvoiceLine(Number(button.closest('[data-invoice-line]').dataset.invoiceLine));
  });
  $('invoiceAddLine').addEventListener('click', () => addInvoiceLine());
  $('invoiceAddTime').addEventListener('click', () => call(showInvoiceTimePicker));
  $('invoiceTimeCancel').addEventListener('click', hideInvoiceTimePicker);
  $('invoiceTimeAdd').addEventListener('click', () => { try { addInvoiceTimeLines(); } catch (e) { showError(e); } });
  $('invoiceShowList').addEventListener('click', () => call(showInvoiceList));
  $('invoiceListClose').addEventListener('click', hideInvoiceList);
  $('invoiceListCloseTop').addEventListener('click', hideInvoiceList);
  $('invoiceListFilter').addEventListener('change', renderInvoiceList);
  $('invoiceListSearch').addEventListener('input', renderInvoiceList);
  $('invoiceListBody').addEventListener('click', e => {
    const paid = e.target.closest('[data-invoice-paid]');
    if (paid) call(() => toggleInvoicePaid(paid.dataset.invoicePaid));
    const open = e.target.closest('[data-invoice-open]');
    if (open) call(() => openInvoiceFile(open.dataset.invoiceOpen));
  });
  $('invoiceNotes').addEventListener('input', renderInvoicePreview);
  $('invoiceBrowseLogo').addEventListener('click', () => call(browseInvoiceLogo));
  $('invoiceRemoveLogo').addEventListener('click', () => call(removeInvoiceLogo));
  $('invoiceGeneratePDF').addEventListener('click', () => generateInvoice('pdf'));
  $('invoiceGenerateWord').addEventListener('click', () => generateInvoice('docx'));
  $('appAuditClose').addEventListener('click', hideAppAuditTrail);
  $('appAuditCloseTop').addEventListener('click', hideAppAuditTrail);
  $('appAuditBackdrop').addEventListener('click', e => { if (e.target === $('appAuditBackdrop')) hideAppAuditTrail(); });
  $('appAuditSearch').addEventListener('input', renderAppAuditTrail);
  $('appAuditSearch').addEventListener('keydown', e => { if (e.key === 'Escape') hideAppAuditTrail(); });
  $('appAuditRefresh').addEventListener('click', () => call(refreshAppAuditTrail));
  $('currencyConverterClose').addEventListener('click', hideCurrencyConverter);
  $('currencyConverterCloseTop').addEventListener('click', hideCurrencyConverter);
  $('currencyConverterBackdrop').addEventListener('click', e => { if (e.target === $('currencyConverterBackdrop')) hideCurrencyConverter(); });
  $('currencyConverterRateType').addEventListener('change', updateCurrencyConverterUI);
  $('currencyConverterYear').addEventListener('change', updateCurrencyConverterUI);
  $('currencyConverterDirection').addEventListener('change', updateCurrencyConverterUI);
  $('currencyConverterCurrency').addEventListener('change', updateCurrencyConverterUI);
  $('currencyConverterAmount').addEventListener('input', () => calculateCurrencyConversion(false));
  $('currencyConverterAmount').addEventListener('keydown', e => { if (e.key === 'Enter') calculateCurrencyConversion(true); if (e.key === 'Escape') hideCurrencyConverter(); });
  $('currencyConverterCalculate').addEventListener('click', () => calculateCurrencyConversion(true));
  $('currencyConverterReset').addEventListener('click', resetCurrencyConverter);
  $('currencyConverterOpenIRS').addEventListener('click', async () => {
    try { await backend().OpenIRSCurrencyExchangeRatesPage(currencyRateType()); } catch (e) { showError(e); }
  });
  $('taxCalculatorClose').addEventListener('click', hideTaxCalculator);
  $('taxCalculatorCloseTop').addEventListener('click', hideTaxCalculator);
  $('taxCalculatorBackdrop').addEventListener('click', e => { if (e.target === $('taxCalculatorBackdrop')) hideTaxCalculator(); });
  $('taxCalculatorCalculate').addEventListener('click', () => { try { calculateTaxEstimate(); } catch (e) { showError(e); } });
  $('taxCalculatorReset').addEventListener('click', resetTaxCalculator);
  $('taxYear').addEventListener('change', updateTaxCalculatorYearUI);
  $('taxIRSPaymentButton').addEventListener('click', async () => {
    try { await backend().OpenIRSPaymentPage(); } catch (e) { showError(e); }
  });
  $('firmCalendarClose').addEventListener('click', hideFirmCalendar);
  $('firmCalendarCloseTop').addEventListener('click', hideFirmCalendar);
  $('firmCalendarBackdrop').addEventListener('click', e => { if (e.target === $('firmCalendarBackdrop')) hideFirmCalendar(); });
  $('firmCalendarYearSelect').addEventListener('change', () => { setFirmCalendarYear(Number($('firmCalendarYearSelect').value), { preferAssignments: true }); clearFirmCalendarClientDetail(); renderFirmCalendarWeek(); });
  $('firmCalendarPrevWeek').addEventListener('click', () => { if (stepFirmCalendarWeek(-1)) renderFirmCalendarWeek(); });
  $('firmCalendarNextWeek').addEventListener('click', () => { if (stepFirmCalendarWeek(1)) renderFirmCalendarWeek(); });
  $('firmCalendarCurrentWeek').addEventListener('click', () => {
    const nowYear = new Date().getFullYear();
    if (FIRM_CALENDAR_YEARS.includes(nowYear) && nowYear !== firmCalendarYear) setFirmCalendarYear(nowYear);
    firmCalendarWeekIndex = firmCalendarCurrentWeekIndex();
    renderFirmCalendarWeek();
  });
  $('firmCalendarWeekSelect').addEventListener('change', () => { firmCalendarWeekIndex = Number($('firmCalendarWeekSelect').value || 0); renderFirmCalendarWeek(); });
  $('firmCalendarSearch').addEventListener('input', renderFirmCalendarSearch);
  $('firmCalendarSearchClear').addEventListener('click', () => { $('firmCalendarSearch').value = ''; renderFirmCalendarSearch(); $('firmCalendarSearch').focus(); });
  $('firmCalendarSearchResults').addEventListener('change', async e => {
    if(e.target.id!=='calendarSearchEditChoice')return;
    const action=e.target.value,item=calendarSearchSelectedAssignment();e.target.value='';
    if(!item)return;
    if(action==='preparer')showCalendarPreparerReassign(item);
    if(action==='date'){firmCalendarContextAssignment=item;showFirmCalendarReassign();}
    if(action==='clear')await setFirmCalendarStatus(item,'');
    if(action.startsWith('status-'))await setFirmCalendarStatus(item,action.slice(7));
  });
  $('firmCalendarSearchResults').addEventListener('click', async e => {
    const selected=e.target.closest('[data-calendar-select-client]');
    if(selected){calendarSearchSelectedClient=selected.dataset.calendarSelectClient;renderFirmCalendarSearch();return;}
    if(e.target.closest('[data-calendar-search-command="go"]')){const item=calendarSearchSelectedAssignment();if(item)goToClientOnCalendar(item.clientId,item.date);return;}

    const go=e.target.closest('[data-calendar-go-client]');
    if(go){goToClientOnCalendar(go.dataset.calendarGoClient,go.dataset.calendarGoDate);return;}
    const assign=e.target.closest('[data-calendar-schedule-client]');
    if(assign){showCalendarScheduleClient(assign.dataset.calendarScheduleClient);return;}
    const result = e.target.closest('[data-calendar-search-date]');
    if (!result) return;
    const date = firmCalendarDateFromISO(result.dataset.calendarSearchDate);
    const targetYear = date.getUTCFullYear();
    if (FIRM_CALENDAR_YEARS.includes(targetYear) && targetYear !== firmCalendarYear) setFirmCalendarYear(targetYear);
    const index = firmCalendarWeekStarts.findIndex(start => date >= start && date <= firmCalendarWeekEnd(start));
    if (index >= 0) { firmCalendarWeekIndex = index; renderFirmCalendarWeek(); }
    await showFirmCalendarClientDocuments(result.dataset.calendarClientId);
  });
  $('firmCalendarSearchResults').addEventListener('contextmenu', e => {
    const item = e.target.closest('[data-calendar-assignment-date][data-calendar-assignment-client]');
    if (!item) return;
    e.preventDefault(); e.stopPropagation();
    showFirmCalendarContextMenu(item.dataset.calendarAssignmentDate, item.dataset.calendarAssignmentClient, e.clientX, e.clientY);
  });
  $('firmCalendarGrid').addEventListener('click', async e => {
    const add = e.target.closest('[data-calendar-add-date]');
    if (add) { await firmCalendarAssignClient(add.dataset.calendarAddDate); return; }
    const remove = e.target.closest('[data-calendar-remove-date]');
    if (remove) { await firmCalendarRemoveClient(remove.dataset.calendarRemoveDate, remove.dataset.calendarRemoveClient); return; }
    const client = e.target.closest('[data-calendar-client-id]');
    if (client) showFirmCalendarClientDocuments(client.dataset.calendarClientId);
  });
  $('firmCalendarGrid').addEventListener('contextmenu', e => {
    const chip = e.target.closest('[data-calendar-assignment-date][data-calendar-assignment-client]');
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    showFirmCalendarContextMenu(chip.dataset.calendarAssignmentDate, chip.dataset.calendarAssignmentClient, e.clientX, e.clientY);
  });
  $('firmCalendarContextMenu').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-calendar-context-action]');
    if (!btn || !firmCalendarContextAssignment) return;
    const item = firmCalendarContextAssignment;
    const action = btn.dataset.calendarContextAction;
    hideAllContextMenus();
    if (action.startsWith('status-')) { await setFirmCalendarStatus(item, action === 'status-clear' ? '' : action.slice(7)); return; }
    if (action === 'reassign-preparer') { showCalendarPreparerReassign(item); return; }
    if (action === 'reassign') { showFirmCalendarReassign(); return; }
    if (action === 'view') { showFirmCalendarClientDocuments(item.clientId); return; }
    if (action === 'remove') { await firmCalendarRemoveClient(item.date, item.clientId); }
  });
  $('firmCalendarReassignCancel').addEventListener('click', hideFirmCalendarReassign);
  $('firmCalendarReassignCloseTop').addEventListener('click', hideFirmCalendarReassign);
  $('firmCalendarReassignSave').addEventListener('click', saveFirmCalendarReassign);
  $('firmCalendarReassignBackdrop').addEventListener('click', e => { if (e.target === $('firmCalendarReassignBackdrop')) hideFirmCalendarReassign(); });
  $('firmCalendarReassignDate').addEventListener('input', updateFirmCalendarReassignConfirmation);
  $('firmCalendarReassignDate').addEventListener('change', updateFirmCalendarReassignConfirmation);
  $('firmCalendarReassignDate').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('firmCalendarReassignSave').disabled) { e.preventDefault(); saveFirmCalendarReassign(); }
    if (e.key === 'Escape') { e.preventDefault(); hideFirmCalendarReassign(); }
  });
  $('firmCalendarClientDocuments').addEventListener('click', async e => {
    const doc = e.target.closest('[data-calendar-document-path]');
    if (doc) await openFirmCalendarDocument(doc.dataset.calendarDocumentPath);
  });
  $('firmCalendarOpenClient').addEventListener('click', openFirmCalendarClientInTree);
  TAX_INPUT_IDS.forEach(id => {
    $(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        try { calculateTaxEstimate(); } catch (err) { showError(err); }
      }
    });
  });
  $('manageUsersClose').addEventListener('click', hideManageUsers);
  $('manageUsersBackdrop').addEventListener('click', e => { if (e.target === $('manageUsersBackdrop')) hideManageUsers(); });
  $('manageUsersAdd').addEventListener('click', async () => {
    hideManageUsers();
    await showExistingCompanyUser();
  });
  $('manageUsersBody').addEventListener('click', e => {
    const button = e.target.closest('[data-enroll-vault]');
    if (button) showVaultEnrollment(button.dataset.enrollVault);
  });
  $('vaultEnrollmentCancel').addEventListener('click', hideVaultEnrollment);
  $('vaultEnrollmentSave').addEventListener('click', completeVaultEnrollment);
  $('vaultEnrollmentPassword').addEventListener('keydown', e => { if (e.key === 'Enter') completeVaultEnrollment(); });
  $('vaultEnrollmentBackdrop').addEventListener('click', e => { if (e.target === $('vaultEnrollmentBackdrop')) hideVaultEnrollment(); });
  $('clientPickerSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = $('clientPickerList').querySelector('[data-client-picker-path]');
      if (first) {
        e.preventDefault();
        closeClientPicker(findNodeByPath(first.dataset.clientPickerPath, clientPickerItems));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeClientPicker(null);
    }
  });
  $('globalFindResults').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const row = e.target.closest('[data-global-path]');
      if (row) { e.preventDefault(); row.click(); }
    }
  });

  document.addEventListener('keydown', async e => {
    const key = String(e.key || '');
    const lower = key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const editingNotes = Boolean($('notesEditor')) && document.activeElement === $('notesEditor');
    const documentPropertiesOpen = !$('documentPropertiesBackdrop').classList.contains('hidden');

    // Context-sensitive Client Notes shortcuts take priority over the main
    // application Ctrl+B backup command.
    if (editingNotes && ctrl && !e.shiftKey && ['s', 'b', 'i', 'u'].includes(lower)) {
      e.preventDefault();
      if (lower === 's') $('saveNotesBtn')?.click();
      else if (lower === 'b') document.execCommand('bold', false, null);
      else if (lower === 'i') document.execCommand('italic', false, null);
      else if (lower === 'u') document.execCommand('underline', false, null);
      return;
    }

    if (!$('calendarScheduleClientBackdrop').classList.contains('hidden')) {
      if(key==='Escape'){e.preventDefault();hideCalendarScheduleClient();}
      return;
    }
    if (!$('firmCalendarPreparerReassignBackdrop').classList.contains('hidden')) {
      if (key === 'Escape') { e.preventDefault(); hideCalendarPreparerReassign(); }
      return;
    }

    // Document Properties deliberately saves on both Ctrl+S and Escape.
    if (documentPropertiesOpen) {
      if (ctrl && !e.shiftKey && lower === 's') {
        e.preventDefault();
        await saveDocumentProperties();
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        await saveDocumentProperties();
        return;
      }
    }

    if (!$('shortcutEditBackdrop').classList.contains('hidden')) {
      if (key === 'Escape') { e.preventDefault(); hideShortcutEditor(); $('shortcutMapperModify').focus(); }
      return;
    }
    if (!$('shortcutMapperBackdrop').classList.contains('hidden')) {
      if (key === 'Escape') { e.preventDefault(); hideShortcutMapper(); }
      return;
    }
    if (!appWorkspaceActive() || e.repeat || e.isComposing) return;
    if (shortcutChord === 'g' && !ctrl && !e.altKey && !e.shiftKey && !activeElementIsEditable() && !modalIsOpen()) {
      shortcutChord = ''; clearTimeout(shortcutChordTimer);
      if (lower === 's') { e.preventDefault(); openSettingsMenuFromShortcut(); return; }
    }
    const binding = shortcutFromEvent(e);
    const action = SHORTCUT_ACTIONS.find(item => shortcutBindings[item.id].includes(binding));
    if (action && (action.id === 'help' || action.id === 'sign-out' || (!activeElementIsEditable() && !modalIsOpen()) || (action.id === 'pdf-find' && !modalIsOpen()))) {
      e.preventDefault();
      try { await runMappedShortcut(action.id); } catch (error) { showError(error); }
      return;
    }

    // Escape closes/cancels secondary windows. Search and Document Properties
    // have their own behavior above/below.
    if (key === 'Escape') {
      if (!$('vaultEnrollmentBackdrop').classList.contains('hidden')) { e.preventDefault(); hideVaultEnrollment(); return; }
      if (!$('userManualBackdrop').classList.contains('hidden')) { e.preventDefault(); hideUserManual(); return; }
      if (!$('engagementWordingBackdrop').classList.contains('hidden')) { e.preventDefault(); hideEngagementWordingEditor(); return; }
      if (!$('invoiceTimeBackdrop').classList.contains('hidden')) { e.preventDefault(); hideInvoiceTimePicker(); return; }
      if (!$('invoiceListBackdrop').classList.contains('hidden')) { e.preventDefault(); hideInvoiceList(); return; }
      if (!$('retentionBackdrop').classList.contains('hidden')) { e.preventDefault(); hideRetention(); return; }
      if (!$('encryptionCheckBackdrop').classList.contains('hidden')) { e.preventDefault(); hideEncryptionCheck(); return; }
      if (!$('wispBackdrop').classList.contains('hidden')) { e.preventDefault(); hideWISP(); return; }
      if (!$('engagementLetterBackdrop').classList.contains('hidden')) { e.preventDefault(); hideEngagementLetter(); return; }
      if (!$('taxCalculatorBackdrop').classList.contains('hidden')) { e.preventDefault(); hideTaxCalculator(); return; }
      if (!$('firmCalendarBackdrop').classList.contains('hidden')) { e.preventDefault(); hideFirmCalendar(); return; }
      if (!$('aboutBackdrop').classList.contains('hidden')) { e.preventDefault(); hideAbout(); return; }
      if (!$('manageUsersBackdrop').classList.contains('hidden')) { e.preventDefault(); hideManageUsers(); return; }
      if (!$('globalFindBackdrop').classList.contains('hidden')) { e.preventDefault(); hideGlobalFind(); return; }
      if (!$('clientCommunicationsBackdrop').classList.contains('hidden')) { e.preventDefault(); hideClientCommunications(); return; }
      if (!$('clientPickerBackdrop').classList.contains('hidden')) { e.preventDefault(); closeClientPicker(null); return; }
      if (!$('propertiesBackdrop').classList.contains('hidden')) { e.preventDefault(); hideClientProperties(); return; }
      if (!$('addClientBackdrop').classList.contains('hidden')) { e.preventDefault(); closeClientForm(null); return; }
      if (!$('modalBackdrop').classList.contains('hidden')) { e.preventDefault(); closeModal(null); return; }
      if (!$('existingCompanyUserBackdrop').classList.contains('hidden')) { e.preventDefault(); hideExistingCompanyUser(); return; }
      if (!$('createAccountBackdrop').classList.contains('hidden')) { e.preventDefault(); hideCreateAccount(); return; }
    }

    // Single-key workflow shortcuts only run in the main workspace while the
    // user is not typing and no secondary modal is open.
    if (ctrl || e.altKey || activeElementIsEditable() || modalIsOpen()) return;

    if (lower === 'g' && !e.shiftKey) {
      e.preventDefault();
      armShortcutChord('g');
      return;
    }


  });
}
