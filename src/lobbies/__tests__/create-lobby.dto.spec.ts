import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateLobbyDto } from '../dto/create-lobby.dto';

type ValidationErrorLike = {
  constraints?: Record<string, string>;
  children?: ValidationErrorLike[];
  property?: string;
};

function flatten(errs: ValidationErrorLike[]): string[] {
  return errs.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...(e.property ? [e.property] : []),
    ...flatten(e.children ?? []),
  ]);
}

async function validateDto(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateLobbyDto, input);
  const errors = await validate(dto as object);
  return flatten(errors as ValidationErrorLike[]);
}

const validFeatures = {
  cstv: true,
  demo: false,
  skinChanger: false,
  highLight: false,
};

describe('CreateLobbyDto', () => {
  it('accepts a well-formed Bo3 payload', async () => {
    const errors = await validateDto({
      mode: 'BO3',
      name: 'Friday scrim',
      region: 'MN',
      serverPassword: 'play123',
      features: validFeatures,
    });
    expect(errors).toEqual([]);
  });

  it('accepts Bo5 and trims name + strips control characters', async () => {
    const dto = plainToInstance(CreateLobbyDto, {
      mode: 'BO5',
      name: '  Team\u0007 Solaris  ',
      region: 'MN',
      features: validFeatures,
    });
    expect(dto.name).toBe('Team Solaris');
    const errors = await validate(dto as object);
    expect(errors).toEqual([]);
  });

  it('rejects tournaments', async () => {
    const errors = await validateDto({
      mode: 'TOURNAMENT',
      name: 'Friday scrim',
      region: 'MN',
      features: validFeatures,
    });
    expect(errors.join('\n')).toMatch(/mode must be/i);
  });

  it('rejects names that are too short (post-trim)', async () => {
    const errors = await validateDto({
      mode: 'BO3',
      name: '  a ',
      region: 'MN',
      features: validFeatures,
    });
    expect(errors.join('\n')).toMatch(/name/i);
  });

  it('rejects unsupported regions', async () => {
    const errors = await validateDto({
      mode: 'BO3',
      name: 'Friday scrim',
      region: 'US-E',
      features: validFeatures,
    });
    expect(errors.join('\n')).toMatch(/region/i);
  });

  it('rejects non-ASCII passwords', async () => {
    const errors = await validateDto({
      mode: 'BO3',
      name: 'Friday scrim',
      region: 'MN',
      serverPassword: 'pāss',
      features: validFeatures,
    });
    expect(errors.join('\n')).toMatch(/serverPassword/i);
  });

  it('requires features object', async () => {
    const errors = await validateDto({
      mode: 'BO3',
      name: 'Friday scrim',
      region: 'MN',
    });
    expect(errors.join('\n')).toMatch(/features/i);
  });

  it('requires all feature booleans', async () => {
    const errors = await validateDto({
      mode: 'BO3',
      name: 'Friday scrim',
      region: 'MN',
      features: { cstv: true, demo: false, skinChanger: false },
    });
    expect(errors.join('\n')).toMatch(/features|highLight/);
  });
});
