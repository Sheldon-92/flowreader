import DOMPurify from 'isomorphic-dompurify';

export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'uuid' | 'email' | 'url';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  sanitize?: boolean;
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedData?: any;
}

export class InputValidator {
  private static instance: InputValidator;

  static getInstance(): InputValidator {
    if (!InputValidator.instance) {
      InputValidator.instance = new InputValidator();
    }
    return InputValidator.instance;
  }

  /**
   * Validate and sanitize input data against a schema
   */
  validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: string[] = [];
    const sanitizedData: any = {};

    // Check for required fields
    for (const [field, rule] of Object.entries(schema)) {
      if (rule.required && (data[field] === undefined || data[field] === null)) {
        errors.push(`${field} is required`);
        continue;
      }

      if (data[field] !== undefined && data[field] !== null) {
        const fieldResult = this.validateField(field, data[field], rule);
        if (!fieldResult.valid) {
          errors.push(...fieldResult.errors);
        } else {
          sanitizedData[field] = fieldResult.sanitizedValue;
        }
      }
    }

    // Check for unexpected fields (security measure)
    for (const field of Object.keys(data)) {
      if (!schema[field]) {
        errors.push(`Unexpected field: ${field}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined
    };
  }

  /**
   * Validate a single field
   */
  private validateField(fieldName: string, value: any, rule: ValidationRule): {
    valid: boolean;
    errors: string[];
    sanitizedValue: any;
  } {
    const errors: string[] = [];
    let sanitizedValue = value;

    // Type validation
    if (rule.type) {
      const typeResult = this.validateType(fieldName, value, rule.type);
      if (!typeResult.valid) {
        errors.push(...typeResult.errors);
        return { valid: false, errors, sanitizedValue: value };
      }
      sanitizedValue = typeResult.sanitizedValue;
    }

    // String-specific validations
    if (typeof sanitizedValue === 'string') {
      // Sanitize if requested
      if (rule.sanitize) {
        sanitizedValue = this.sanitizeString(sanitizedValue);
      }

      // Length validation
      if (rule.minLength && sanitizedValue.length < rule.minLength) {
        errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
      }
      if (rule.maxLength && sanitizedValue.length > rule.maxLength) {
        errors.push(`${fieldName} must be no more than ${rule.maxLength} characters long`);
      }

      // Pattern validation
      if (rule.pattern && !rule.pattern.test(sanitizedValue)) {
        errors.push(`${fieldName} format is invalid`);
      }
    }

    // Number-specific validations
    if (typeof sanitizedValue === 'number') {
      if (rule.min !== undefined && sanitizedValue < rule.min) {
        errors.push(`${fieldName} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && sanitizedValue > rule.max) {
        errors.push(`${fieldName} must be no more than ${rule.max}`);
      }
    }

    // Array-specific validations
    if (Array.isArray(sanitizedValue)) {
      if (rule.minLength && sanitizedValue.length < rule.minLength) {
        errors.push(`${fieldName} must have at least ${rule.minLength} items`);
      }
      if (rule.maxLength && sanitizedValue.length > rule.maxLength) {
        errors.push(`${fieldName} must have no more than ${rule.maxLength} items`);
      }
    }

    // Allowed values validation
    if (rule.allowedValues && !rule.allowedValues.includes(sanitizedValue)) {
      errors.push(`${fieldName} must be one of: ${rule.allowedValues.join(', ')}`);
    }

    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(sanitizedValue);
      if (customResult !== true) {
        errors.push(typeof customResult === 'string' ? customResult : `${fieldName} is invalid`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedValue
    };
  }

  /**
   * Validate data type and convert if necessary
   */
  private validateType(fieldName: string, value: any, expectedType: string): {
    valid: boolean;
    errors: string[];
    sanitizedValue: any;
  } {
    const errors: string[] = [];

    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${fieldName} must be a string`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: value };

      case 'number':
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (typeof num !== 'number' || isNaN(num)) {
          errors.push(`${fieldName} must be a valid number`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: num };

      case 'boolean':
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'true') return { valid: true, errors: [], sanitizedValue: true };
          if (value.toLowerCase() === 'false') return { valid: true, errors: [], sanitizedValue: false };
        }
        if (typeof value !== 'boolean') {
          errors.push(`${fieldName} must be a boolean`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: value };

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${fieldName} must be an array`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: value };

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`${fieldName} must be an object`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: value };

      case 'uuid':
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof value !== 'string' || !uuidPattern.test(value)) {
          errors.push(`${fieldName} must be a valid UUID`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: value };

      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof value !== 'string' || !emailPattern.test(value)) {
          errors.push(`${fieldName} must be a valid email address`);
          return { valid: false, errors, sanitizedValue: value };
        }
        return { valid: true, errors: [], sanitizedValue: value.toLowerCase() };

      case 'url':
        try {
          new URL(value);
          return { valid: true, errors: [], sanitizedValue: value };
        } catch {
          errors.push(`${fieldName} must be a valid URL`);
          return { valid: false, errors, sanitizedValue: value };
        }

      default:
        errors.push(`Unknown type: ${expectedType}`);
        return { valid: false, errors, sanitizedValue: value };
    }
  }

  /**
   * Sanitize string input to prevent XSS and other attacks
   */
  private sanitizeString(input: string): string {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');

    // HTML sanitization using DOMPurify
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: []  // No attributes allowed
    });

    // Remove control characters except tab, newline, and carriage return
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Validate file upload data
   */
  validateFileUpload(data: any): ValidationResult {
    const schema: ValidationSchema = {
      fileName: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: /^[a-zA-Z0-9._-]+\.epub$/i,
        sanitize: true
      },
      fileSize: {
        required: true,
        type: 'number',
        min: 1,
        max: 50 * 1024 * 1024 // 50MB
      },
      fileData: {
        required: true,
        type: 'array',
        maxLength: 50 * 1024 * 1024 // 50MB worth of bytes
      },
      userId: {
        required: true,
        type: 'uuid'
      }
    };

    return this.validate(data, schema);
  }

  /**
   * Validate note creation data
   */
  validateNoteCreation(data: any): ValidationResult {
    const schema: ValidationSchema = {
      bookId: {
        required: true,
        type: 'uuid'
      },
      content: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 4000,
        sanitize: true
      },
      chapterId: {
        required: false,
        type: 'uuid'
      },
      selection: {
        required: false,
        type: 'object',
        custom: (value) => {
          if (value && typeof value === 'object') {
            if (value.text && typeof value.text === 'string' && value.text.length > 1000) {
              return 'Selection text must be 1000 characters or less';
            }
          }
          return true;
        }
      },
      meta: {
        required: false,
        type: 'object'
      }
    };

    return this.validate(data, schema);
  }

  /**
   * Validate reading position update
   */
  validatePositionUpdate(data: any): ValidationResult {
    const schema: ValidationSchema = {
      bookId: {
        required: true,
        type: 'uuid'
      },
      userId: {
        required: true,
        type: 'uuid'
      },
      chapterIdx: {
        required: true,
        type: 'number',
        min: 0,
        max: 9999
      },
      percentage: {
        required: true,
        type: 'number',
        min: 0,
        max: 100
      },
      cfiPosition: {
        required: false,
        type: 'string',
        maxLength: 500,
        sanitize: true
      }
    };

    return this.validate(data, schema);
  }

  /**
   * Validate chat request
   */
  validateChatRequest(data: any): ValidationResult {
    const schema: ValidationSchema = {
      bookId: {
        required: true,
        type: 'uuid'
      },
      intent: {
        required: false,
        type: 'string',
        allowedValues: ['translate', 'explain', 'analyze', 'ask', 'enhance']
      },
      query: {
        required: false,
        type: 'string',
        maxLength: 2000,
        sanitize: true
      },
      targetLang: {
        required: false,
        type: 'string',
        pattern: /^[a-z]{2}(-[A-Z]{2})?$/,
        maxLength: 5
      },
      enhanceType: {
        required: false,
        type: 'string',
        allowedValues: ['concept', 'historical', 'cultural', 'general']
      },
      selection: {
        required: false,
        type: 'object',
        custom: (value) => {
          if (value && typeof value === 'object') {
            if (value.text && typeof value.text === 'string' && value.text.length > 1000) {
              return 'Selection text must be 1000 characters or less';
            }
          }
          return true;
        }
      }
    };

    const result = this.validate(data, schema);

    // Custom validation for intent-specific requirements
    if (result.valid && result.sanitizedData) {
      const { intent, selection, query, targetLang } = result.sanitizedData;

      if (intent && intent !== 'ask' && (!selection || !selection.text)) {
        result.valid = false;
        result.errors.push('Selection with text is required for this intent');
      }

      if (intent === 'ask' && !query) {
        result.valid = false;
        result.errors.push('Query is required for ask intent');
      }

      if (intent === 'translate' && !targetLang) {
        result.valid = false;
        result.errors.push('Target language is required for translate intent');
      }
    }

    return result;
  }

  /**
   * Validate signed URL request
   */
  validateSignedUrlRequest(data: any): ValidationResult {
    const schema: ValidationSchema = {
      fileName: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: /^[a-zA-Z0-9._-]+\.epub$/i,
        sanitize: true
      },
      fileSize: {
        required: true,
        type: 'number',
        min: 1,
        max: 50 * 1024 * 1024 // 50MB
      }
    };

    return this.validate(data, schema);
  }

  /**
   * Validate auto note creation request
   */
  validateAutoNoteRequest(data: any): ValidationResult {
    const schema: ValidationSchema = {
      bookId: {
        required: true,
        type: 'uuid'
      },
      selection: {
        required: false,
        type: 'object',
        custom: (value) => {
          if (value && typeof value === 'object') {
            if (!value.text || typeof value.text !== 'string') {
              return 'Selection must have text property of type string';
            }
            if (value.text.length > 1000) {
              return 'Selection text must be 1000 characters or less';
            }
            if (value.start !== undefined && typeof value.start !== 'number') {
              return 'Selection start must be a number';
            }
            if (value.end !== undefined && typeof value.end !== 'number') {
              return 'Selection end must be a number';
            }
            if (value.chapterId && typeof value.chapterId !== 'string') {
              return 'Selection chapterId must be a string';
            }
          }
          return true;
        }
      },
      intent: {
        required: false,
        type: 'string',
        allowedValues: ['translate', 'explain', 'analyze', 'ask', 'enhance']
      },
      contextScope: {
        required: false,
        type: 'string',
        allowedValues: ['selection', 'recent_dialog', 'chapter']
      },
      options: {
        required: false,
        type: 'object',
        custom: (value) => {
          if (value && typeof value === 'object') {
            if (value.maxLength !== undefined && (typeof value.maxLength !== 'number' || value.maxLength < 50 || value.maxLength > 4000)) {
              return 'maxLength must be a number between 50 and 4000';
            }
            if (value.includeMetrics !== undefined && typeof value.includeMetrics !== 'boolean') {
              return 'includeMetrics must be a boolean';
            }
          }
          return true;
        }
      }
    };

    const result = this.validate(data, schema);

    // Custom validation for auto note specific requirements
    if (result.valid && result.sanitizedData) {
      const { selection, intent, contextScope } = result.sanitizedData;

      // If intent is enhance, selection is required
      if (intent === 'enhance' && (!selection || !selection.text)) {
        result.valid = false;
        result.errors.push('Selection with text is required for enhance intent');
      }

      // If no selection is provided, we need either intent or contextScope for guidance
      if (!selection && !intent && !contextScope) {
        result.valid = false;
        result.errors.push('Either selection, intent, or contextScope must be provided');
      }
    }

    return result;
  }

  /**
   * Validate feedback submission
   */
  validateFeedback(data: any): ValidationResult {
    const schema: ValidationSchema = {
      type: {
        required: true,
        type: 'string',
        allowedValues: ['bug', 'feature', 'general', 'praise']
      },
      rating: {
        required: true,
        type: 'number',
        min: 1,
        max: 5
      },
      category: {
        required: true,
        type: 'string',
        allowedValues: ['usability', 'performance', 'ai-interaction', 'reading-experience', 'technical', 'other']
      },
      description: {
        required: true,
        type: 'string',
        minLength: 10,
        maxLength: 1000,
        sanitize: true,
        custom: (value) => {
          if (typeof value !== 'string') return 'Description must be a string';

          const trimmed = value.trim();
          if (trimmed.length === 0) {
            return 'Description cannot be empty';
          }

          // Check for potential PII patterns
          const piiPatterns = [
            { pattern: /\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/i, message: 'Please do not include email addresses' },
            { pattern: /\b\d{3}-\d{2}-\d{4}\b/, message: 'Please do not include SSN' },
            { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, message: 'Please do not include credit card numbers' },
            { pattern: /\b\d{3}-\d{3}-\d{4}\b/, message: 'Please do not include phone numbers' }
          ];

          for (const { pattern, message } of piiPatterns) {
            if (pattern.test(value)) {
              return message;
            }
          }

          return true;
        }
      },
      sessionId: {
        required: true,
        type: 'string',
        minLength: 16,
        maxLength: 64,
        pattern: /^[a-f0-9]+$/i
      },
      timestamp: {
        required: true,
        type: 'string',
        custom: (value) => {
          try {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
              return 'Invalid timestamp format';
            }
            // Check if timestamp is within reasonable range (last 24 hours to 5 minutes future)
            const now = Date.now();
            const submissionTime = date.getTime();
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            const fiveMinutesFuture = now + (5 * 60 * 1000);

            if (submissionTime < oneDayAgo || submissionTime > fiveMinutesFuture) {
              return 'Timestamp is outside valid range';
            }
            return true;
          } catch {
            return 'Invalid timestamp format';
          }
        }
      },
      userAgent: {
        required: false,
        type: 'string',
        maxLength: 50
      },
      route: {
        required: false,
        type: 'string',
        maxLength: 100,
        sanitize: true
      }
    };

    return this.validate(data, schema);
  }
}

// Export singleton instance
export const inputValidator = InputValidator.getInstance();