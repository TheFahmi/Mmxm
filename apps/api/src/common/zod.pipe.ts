import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: unknown, _meta: ArgumentMetadata) {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        issues: r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
