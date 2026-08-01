import {
  createLegalDocuments,
  LEGAL_DOCUMENT_ORDER,
} from '../legal/legalDocuments';

describe('shared legal documents', () => {
  it('keeps every public legal surface in the shared canonical set', () => {
    const documents = createLegalDocuments({
      legalEntityName: 'V3l0city Labs, Inc.',
      legalEffectiveDate: 'August 1, 2026',
      termsVersion: '2026-08-01',
    });

    expect(LEGAL_DOCUMENT_ORDER).toEqual([
      'privacy',
      'terms',
      'safety',
      'acceptable-use',
      'data-rights',
      'cookies',
    ]);
    expect(documents.privacy.sections.flatMap((section) => section.paragraphs))
      .toContain(
        'Trip information: started/ended time, distance, derived speed samples, and trip summaries. V3l0city does not persist raw route coordinates in its web or mobile trip libraries.',
      );
    expect(documents.terms.sections.flatMap((section) => section.paragraphs))
      .toContain(
        'V3l0city Labs, Inc. retains rights in V3l0city and its brand. You retain rights in your information, subject to rights needed to operate the service.',
      );
  });
});
