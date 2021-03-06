import HttpException from '../exceptions/http.exception';
import { Request, Response, NextFunction } from 'express';

const errorMiddleware = async (error: Error, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof HttpException) {
    const status: number = error.status || 500;
    const message = error.message || 'Internal Server Error';
    return response.status(status).send({ status, message });
  }
  return response.status(500).send({ message: 'Internal Server Error' });
};

export default errorMiddleware;
