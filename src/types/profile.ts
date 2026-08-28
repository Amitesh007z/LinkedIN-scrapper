export interface Experience {
  title: string | null;
  company: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export interface Education {
  school: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export interface Certification {
  name: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  credential_id: string | null;
}

export interface Language {
  name: string | null;
  proficiency: string | null;
}

export interface Profile {
  profile_url: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  profile_image_url: string | null;
  experience: Experience[];
  education: Education[];
  skills: string[];
  certifications: Certification[];
  languages: Language[];
}

export interface ProfileResponse {
  data: Profile;
  meta: {
    source: 'linkedin';
    schema_version: '1.0';
    cached: boolean;
    fetched_at: string;
  };
}
