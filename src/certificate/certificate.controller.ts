import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { GenerateCertificateDto } from './certificate.dto';

@Controller('certificate')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Post('generate')
  generate(@Body() dto: GenerateCertificateDto) {
    return this.certificateService.generate(dto);
  }

  @Get('eligibility/:studentId/:courseId')
  checkEligibility(
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.certificateService.checkEligibility(
      Number(studentId),
      Number(courseId),
    );
  }

  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.certificateService.verify(code);
  }

  @Get()
  findAll() {
    return this.certificateService.findAll();
  }

  @Get(':idOrCode')
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.certificateService.findOne(idOrCode);
  }
}
