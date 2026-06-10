import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TournamentInquiryDto } from '../dto/tournament-inquiry.dto';

async function validateDto(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(TournamentInquiryDto, input);
  const errors = await validate(dto as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

const base = {
  contactEmail: 'org@example.com',
  contactName: 'Batbayar',
  bracketSize: 8,
  format: 'single-elim',
};

describe('TournamentInquiryDto', () => {
  it('accepts a minimal inquiry', async () => {
    const errors = await validateDto(base);
    expect(errors).toEqual([]);
  });

  it('rejects malformed email', async () => {
    const errors = await validateDto({ ...base, contactEmail: 'not-an-email' });
    expect(errors.join('\n')).toMatch(/contactEmail/i);
  });

  it('rejects contactName shorter than 2 chars', async () => {
    const errors = await validateDto({ ...base, contactName: 'A' });
    expect(errors.join('\n')).toMatch(/contactName/i);
  });

  it('rejects invalid bracketSize', async () => {
    const errors = await validateDto({ ...base, bracketSize: 12 });
    expect(errors.join('\n')).toMatch(/bracketSize/);
  });

  it('rejects unknown format', async () => {
    const errors = await validateDto({ ...base, format: 'mystery' });
    expect(errors.join('\n')).toMatch(/format/);
  });

  it('rejects notes longer than 2000 chars', async () => {
    const errors = await validateDto({
      ...base,
      notes: 'x'.repeat(2001),
    });
    expect(errors.join('\n')).toMatch(/notes/);
  });
});
