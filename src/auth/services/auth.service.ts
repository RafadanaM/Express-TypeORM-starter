import { Repository } from 'typeorm';
import AppDataSource from '../../db/data-source';
import Users from '../../users/entities/users.entity';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../common/utils/token.util';
import { isQueryFailedError } from '../../common/utils/db.util';
import { comparePassword, hashPassword } from '../../common/utils/hash.util';
import RegisterDTO from '../dto/register.dto';
import LoginDTO from '../dto/login.dto';
import BadRequestException from '../../common/exceptions/badRequest.exception';
import InternalServerErrorException from '../../common/exceptions/internalServerError.exception';
import UnauthorizedException from '../../common/exceptions/unauthorized.exception';

class AuthService {
  usersRepository: Repository<Users>;

  constructor() {
    this.usersRepository = AppDataSource.getRepository(Users);
  }

  public async register(userData: RegisterDTO): Promise<string> {
    try {
      const hashed_password = await hashPassword(userData.password);
      const newUser = this.usersRepository.create({ ...userData, password: hashed_password });
      await this.usersRepository.save(newUser);
      const message = 'User created!';
      return message;
    } catch (error) {
      if (isQueryFailedError(error)) {
        if (error.code === '23505') {
          throw new BadRequestException('Email already exists');
        }
      }
      throw new InternalServerErrorException();
    }
  }

  public async login(loginData: LoginDTO, oldToken: string | undefined) {
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .select(['users.email', 'users.id', 'users.password', 'users.refresh_tokens'])
      .where('users.email = :email', { email: loginData.email })
      .getOne();
    if (!user) throw new BadRequestException('Email or Password does not match');

    const isMatch = await comparePassword(loginData.password, user.password);
    if (!isMatch) throw new BadRequestException('Email or Password does not match');

    const accessToken = signAccessToken({
      id: user.id,
    });
    const refreshToken = signRefreshToken({ id: user.id });

    const userResponse: Partial<Users> = {
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    };

    // If there's an old token in cookie when loggin in, then remove that token from list
    const newRefreshTokens =
      oldToken === undefined ? user.refresh_tokens : user.refresh_tokens.filter((rt) => rt !== oldToken);
    await this.usersRepository
      .createQueryBuilder('users')
      .update()
      .set({ refresh_tokens: [...newRefreshTokens, refreshToken] })
      .where('users.email = :email', { email: user.email })
      .execute();

    return { accessToken, refreshToken, userResponse };
  }

  public async logout(token: string) {
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .select(['users.email', 'users.refresh_tokens'])
      .where(':token = ANY (users.refresh_tokens)', { token: token })
      .getOne();

    if (user) {
      const filteredRefreshTokens = user.refresh_tokens.filter((rt) => rt !== token);
      await this.usersRepository
        .createQueryBuilder('users')
        .update()
        .set({ refresh_tokens: [...filteredRefreshTokens] })
        .where('users.email = :email', { email: user.email })
        .execute();
    }
    return;
  }

  public async refresh(token: string | undefined) {
    if (token === undefined) throw new UnauthorizedException('Token is missing');

    const refreshTokenResponse = verifyRefreshToken(token);

    // if token is invalid/expires
    if (refreshTokenResponse === null) {
      const mUser = await this.usersRepository
        .createQueryBuilder('users')
        .select(['users.email , users.refresh_tokens'])
        .where(':token = ANY (users.refresh_tokens)', { token: token })
        .getOne();

      // if user with the expired/invalid token exist, then remove the token
      if (mUser) {
        await this.usersRepository
          .createQueryBuilder('users')
          .update()
          .set({ refresh_tokens: [...mUser.refresh_tokens.filter((rt) => rt !== token)] })
          .where('users.email = :email', { email: mUser.email })
          .execute();
      }

      throw new UnauthorizedException('Token is invalid');
    }
    // Token is valid
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .select(['users.email', 'users.first_name', 'users.last_name', 'users.refresh_tokens'])
      .where('users.id = :id', { email: refreshTokenResponse.id })
      .getOne();
    if (!user) {
      throw new UnauthorizedException('Token is invalid');
    }

    // if token does not exists on a users refresh_token
    const userRefreshTokenIndex = user.refresh_tokens.indexOf(token);
    if (userRefreshTokenIndex === -1) {
      // Then it is token re-use, empty the users refresh_token
      user.refresh_tokens = [];
      await this.usersRepository
        .createQueryBuilder('users')
        .update()
        .set({ refresh_tokens: [] })
        .where('users.id = :id', { email: user.id })
        .execute();
      throw new UnauthorizedException('Token is invalid');
    }

    // Token does exists on users refresh token, remove the token
    // and add a new refresh token to the list

    const refreshToken = signRefreshToken({ id: user.id });
    const accessToken = signAccessToken({
      id: user.id,
    });

    const userResponse: Partial<Users> = {
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    };

    await this.usersRepository
      .createQueryBuilder('users')
      .update()
      .set({ refresh_tokens: [...user.refresh_tokens.filter((x) => x !== token), refreshToken] })
      .where('users.email = :email', { email: user.email })
      .execute();
    return { accessToken, refreshToken, userResponse };
  }
}
export default AuthService;