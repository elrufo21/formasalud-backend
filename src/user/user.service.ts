import { Injectable } from '@nestjs/common';
import { ExecuteService } from '../execute/execute.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly executeService: ExecuteService) {}

  create(createUserDto: CreateUserDto) {
    return this.executeService.execute('users', 'i', createUserDto as any);
  }

  findAll() {
    return this.executeService.execute('users', 's');
  }

  findOne(id: number) {
    return this.executeService.execute('users', 's1', {
      user_id: id,
    });
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return this.executeService.execute('users', 'u', {
      user_id: id,
      ...updateUserDto,
    } as any);
  }

  remove(id: number) {
    return this.executeService.execute('users', 'd', {
      user_id: id,
    });
  }

  getCombo() {
    return this.executeService.execute('users', 'sc');
  }
}
