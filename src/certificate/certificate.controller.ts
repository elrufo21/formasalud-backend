import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { GenerateCertificateDto } from './certificate.dto';
import { CurrentUser, Public, Roles } from 'src/auth/auth.decorators';

@Controller('certificate')
@Roles('admin')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Post('generate')
  @Roles('admin')
  generate(@Body() dto: GenerateCertificateDto) {
    return this.certificateService.generate(dto);
  }

  @Get('eligibility/:studentId/:courseId')
  @Roles('student', 'admin')
  checkEligibility(
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
    @CurrentUser() user: { user_id: number; roles: string[] },
  ) {
    if (!user.roles.includes('admin') && user.user_id !== Number(studentId)) {
      throw new ForbiddenException('Solo puedes consultar tu propia elegibilidad');
    }
    return this.certificateService.checkEligibility(
      Number(studentId),
      Number(courseId),
    );
  }

  @Get('verify/:code')
  @Public()
  verify(@Param('code') code: string) {
    return this.certificateService.verify(code);
  }

  @Get()
  @Roles('admin')
  findAll() {
    return this.certificateService.findAll();
  }

  @Get('mine')
  @Roles('student', 'admin')
  findMine(@CurrentUser() user: { user_id: number }) {
    return this.certificateService.findMine(user.user_id);
  }

  @Get(':idOrCode')
  @Roles('admin')
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.certificateService.findOne(idOrCode);
  }
}
