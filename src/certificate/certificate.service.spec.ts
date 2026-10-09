import { CertificateService } from './certificate.service';
import { ExecuteService } from '../execute/execute.service';
import { DatabaseService } from '../database/database.service';

jest.mock('../execute/execute.service', () => ({ ExecuteService: class {} }));
jest.mock('../database/database.service', () => ({ DatabaseService: class {} }));

it('returns each issued certificate with its linked model and course metadata', async () => {
  const execute = { execute: jest.fn().mockResolvedValue([
    { certificate_code: 'REG-0075-2026', course_title: 'Triaje' },
    { certificate_code: 'REG-0076-2026', course_title: 'Obstetricia' },
  ]) };
  const database = { query: jest.fn().mockResolvedValue({ rows: [
    { certificate_code: 'REG-0075-2026', config_json: { layout: 'triaje-fisiouci', hours: 2, course_date_text: '06 de octubre de 2026' } },
    { certificate_code: 'REG-0076-2026', config_json: { layout: 'formasalud-classic', hours: 3, course_date_text: '07 de octubre de 2026' } },
  ] }) };
  const service = new CertificateService(execute as unknown as ExecuteService, database as unknown as DatabaseService);

  expect(await service.findAll()).toEqual([
    expect.objectContaining({ certificate_code: 'REG-0075-2026', template_key: 'triaje-fisiouci', hours: 2 }),
    expect.objectContaining({ certificate_code: 'REG-0076-2026', template_key: 'formasalud-classic', hours: 3 }),
  ]);
  expect(database.query).toHaveBeenCalledTimes(1);
});
