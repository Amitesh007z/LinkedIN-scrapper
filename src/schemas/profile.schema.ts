import { z } from 'zod';

const nullableText = z.string().nullable();

export const experienceSchema = z.object({
  title: nullableText,
  company: nullableText,
  location: nullableText,
  start_date: nullableText,
  end_date: nullableText,
  description: nullableText
});

export const educationSchema = z.object({
  school: nullableText,
  degree: nullableText,
  field_of_study: nullableText,
  start_date: nullableText,
  end_date: nullableText,
  description: nullableText
});

export const certificationSchema = z.object({
  name: nullableText,
  issuer: nullableText,
  issue_date: nullableText,
  expiration_date: nullableText,
  credential_id: nullableText
});

export const languageSchema = z.object({
  name: nullableText,
  proficiency: nullableText
});

export const profileSchema = z.object({
  profile_url: z.string().url(),
  name: nullableText,
  headline: nullableText,
  location: nullableText,
  about: nullableText,
  profile_image_url: z.string().url().nullable(),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  skills: z.array(z.string()),
  certifications: z.array(certificationSchema),
  languages: z.array(languageSchema)
});

export const profileResponseSchema = z.object({
  data: profileSchema,
  meta: z.object({
    source: z.literal('linkedin'),
    schema_version: z.literal('1.0'),
    cached: z.boolean(),
    fetched_at: z.string().datetime()
  })
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;
