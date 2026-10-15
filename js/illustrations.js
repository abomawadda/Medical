/* ====================================================================
 * WE Medical Directory - Vector SVG Illustrations Engine (v3.1)
 * Authentic WE Brand Identity (#4A148C / #5B2C82 / #E6007E)
 * Vector Placeholders & Department Illustrations
 * Prepared by: Mahmoud El-Eraky (أ / محمود العراقي)
 * ==================================================================== */

(function (window) {
  'use strict';

  const Illustrations = {
    // 1. Male Doctor Illustration
    doctorMale(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لطبيب">
          <circle cx="40" cy="40" r="38" fill="#F3E8FF" stroke="#5B2C82" stroke-width="2.5"/>
          <!-- Head & Hair -->
          <path d="M28 26C28 19.37 33.37 14 40 14C46.63 14 52 19.37 52 26C52 32.63 46.63 38 40 38C33.37 38 28 32.63 28 26Z" fill="#FAD7A0"/>
          <path d="M28 22C28 17 33 13 40 13C47 13 52 17 52 22C50 18 45 16 40 16C35 16 30 18 28 22Z" fill="#3E2723"/>
          <!-- Body / White Coat -->
          <path d="M22 66C22 52 30 46 40 46C50 46 58 52 58 66H22Z" fill="#FFFFFF" stroke="#5B2C82" stroke-width="1.8"/>
          <!-- Shirt & Tie -->
          <path d="M37 46L40 52L43 46H37Z" fill="#E6007E"/>
          <!-- Stethoscope -->
          <path d="M31 46C31 54 36 58 40 58C44 58 49 54 49 46" stroke="#4A148C" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="40" cy="60" r="3.2" fill="#E6007E" stroke="#5B2C82" stroke-width="1.5"/>
          <!-- Medical Badge -->
          <rect x="25" y="52" width="6" height="4" rx="1" fill="#5B2C82"/>
        </svg>
      `;
    },

    // 2. Female Doctor Illustration
    doctorFemale(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لطبيبة">
          <circle cx="40" cy="40" r="38" fill="#FDF2F8" stroke="#E6007E" stroke-width="2.5"/>
          <!-- Hijab / Headcover -->
          <path d="M26 28C26 18 32 14 40 14C48 14 54 18 54 28C54 36 50 42 40 42C30 42 26 36 26 28Z" fill="#5B2C82"/>
          <!-- Face -->
          <ellipse cx="40" cy="28" rx="8" ry="9.5" fill="#FAD7A0"/>
          <!-- Hijab wrap -->
          <path d="M26 38C28 44 34 46 40 46C46 46 52 44 54 38C52 42 46 44 40 44C34 44 28 42 26 38Z" fill="#4A148C"/>
          <!-- Body / Lab Coat -->
          <path d="M22 66C22 53 30 47 40 47C50 47 58 53 58 66H22Z" fill="#FFFFFF" stroke="#5B2C82" stroke-width="1.8"/>
          <!-- Stethoscope -->
          <path d="M32 47C32 54 36 57 40 57C44 57 48 54 48 47" stroke="#E6007E" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="40" cy="59" r="3" fill="#5B2C82" stroke="#E6007E" stroke-width="1.5"/>
          <!-- Pink Pocket Ribbon -->
          <rect x="25" y="53" width="6" height="3" rx="1" fill="#E6007E"/>
        </svg>
      `;
    },

    // 3. Hospital Building Illustration
    hospital(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لمستشفى">
          <circle cx="40" cy="40" r="38" fill="#F3E8FF" stroke="#5B2C82" stroke-width="2.5"/>
          <!-- Main Building -->
          <rect x="20" y="24" width="40" height="42" rx="3" fill="#FFFFFF" stroke="#5B2C82" stroke-width="2"/>
          <!-- Red/Pink Medical Cross -->
          <rect x="37" y="16" width="6" height="14" rx="1" fill="#E6007E"/>
          <rect x="33" y="20" width="14" height="6" rx="1" fill="#E6007E"/>
          <!-- Windows -->
          <rect x="26" y="32" width="6" height="6" rx="1" fill="#5B2C82" opacity="0.8"/>
          <rect x="37" y="32" width="6" height="6" rx="1" fill="#5B2C82" opacity="0.8"/>
          <rect x="48" y="32" width="6" height="6" rx="1" fill="#5B2C82" opacity="0.8"/>
          <rect x="26" y="42" width="6" height="6" rx="1" fill="#5B2C82" opacity="0.8"/>
          <rect x="37" y="42" width="6" height="6" rx="1" fill="#5B2C82" opacity="0.8"/>
          <rect x="48" y="42" width="6" height="6" rx="1" fill="#5B2C82" opacity="0.8"/>
          <!-- Entrance Door -->
          <path d="M35 66V54H45V66H35Z" fill="#5B2C82"/>
        </svg>
      `;
    },

    // 4. Laboratory Illustration
    lab(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لمعمل تحاليل">
          <circle cx="40" cy="40" r="38" fill="#E0F2FE" stroke="#0288D1" stroke-width="2.5"/>
          <!-- Flask -->
          <path d="M37 20H43V30L53 50C55 54 52 58 48 58H32C28 58 25 54 27 50L37 30V20Z" fill="#FFFFFF" stroke="#0288D1" stroke-width="2.2" stroke-linejoin="round"/>
          <!-- Liquid with WE gradient -->
          <path d="M30 45L34 37L46 37L50 45C51 47 49 56 46 56H34C31 56 29 47 30 45Z" fill="#5B2C82" opacity="0.85"/>
          <!-- Bubbles -->
          <circle cx="36" cy="44" r="2.2" fill="#E6007E"/>
          <circle cx="43" cy="48" r="1.6" fill="#FFFFFF"/>
          <circle cx="39" cy="51" r="2" fill="#E6007E"/>
          <!-- Flask rim -->
          <rect x="35" y="18" width="10" height="3" rx="1.5" fill="#0288D1"/>
        </svg>
      `;
    },

    // 5. Radiology / X-Ray Illustration
    radiology(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لمركز أشعة">
          <circle cx="40" cy="40" r="38" fill="#F3E8FF" stroke="#7B1FA2" stroke-width="2.5"/>
          <!-- Screen / Scanner Frame -->
          <rect x="22" y="22" width="36" height="36" rx="4" fill="#1E1B4B" stroke="#7B1FA2" stroke-width="2"/>
          <!-- X-Ray Skeleton / Rays -->
          <path d="M40 28V52" stroke="#E6007E" stroke-width="3" stroke-linecap="round"/>
          <path d="M32 34C36 37 44 37 48 34" stroke="#A855F7" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M31 40C36 43 44 43 49 40" stroke="#A855F7" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M33 46C37 48 43 48 47 46" stroke="#A855F7" stroke-width="2.2" stroke-linecap="round"/>
          <!-- Radiation Symbol / Tech dots -->
          <circle cx="53" cy="27" r="2.5" fill="#E6007E"/>
        </svg>
      `;
    },

    // 6. Pharmacy Illustration
    pharmacy(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لصيدلية">
          <circle cx="40" cy="40" r="38" fill="#ECFDF5" stroke="#10B981" stroke-width="2.5"/>
          <!-- Capsule Pill -->
          <g transform="rotate(-35 40 40)">
            <rect x="26" y="32" width="14" height="16" rx="7" fill="#E6007E"/>
            <rect x="40" y="32" width="14" height="16" rx="7" fill="#5B2C82"/>
            <rect x="26" y="32" width="28" height="16" rx="8" stroke="#FFFFFF" stroke-width="1.8" fill="none"/>
          </g>
          <!-- Green Pharmacy Cross -->
          <rect x="52" y="16" width="5" height="14" rx="1.5" fill="#10B981"/>
          <rect x="47.5" y="20.5" width="14" height="5" rx="1.5" fill="#10B981"/>
          <!-- Small tablet -->
          <circle cx="26" cy="56" r="6" fill="#FFFFFF" stroke="#10B981" stroke-width="2"/>
          <line x1="22" y1="56" x2="30" y2="56" stroke="#10B981" stroke-width="1.5"/>
        </svg>
      `;
    },

    // 7. Emergency & Ambulance Illustration
    emergency(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي للطوارئ والإسعاف">
          <circle cx="40" cy="40" r="38" fill="#FEF2F2" stroke="#DC2626" stroke-width="2.5"/>
          <!-- Ambulance Body -->
          <path d="M18 52V38C18 36.89 18.89 36 20 36H46L54 44H60C61.11 44 62 44.89 62 46V52H18Z" fill="#FFFFFF" stroke="#DC2626" stroke-width="2"/>
          <!-- Siren -->
          <rect x="33" y="32" width="7" height="4" rx="1.5" fill="#DC2626"/>
          <path d="M34 30L33 27M37 29V26M39 30L40 27" stroke="#E6007E" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Red Cross -->
          <rect x="32" y="41" width="4" height="8" rx="0.8" fill="#DC2626"/>
          <rect x="30" y="43" width="8" height="4" rx="0.8" fill="#DC2626"/>
          <!-- Wheels -->
          <circle cx="28" cy="54" r="5" fill="#374151" stroke="#FFFFFF" stroke-width="1.5"/>
          <circle cx="50" cy="54" r="5" fill="#374151" stroke="#FFFFFF" stroke-width="1.5"/>
        </svg>
      `;
    },

    // 8. Dental Care Illustration
    dental(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي لطب الأسنان">
          <circle cx="40" cy="40" r="38" fill="#E0F7FA" stroke="#00ACC1" stroke-width="2.5"/>
          <!-- Molar Tooth -->
          <path d="M30 25C34 22 40 24 40 24C40 24 46 22 50 25C55 29 55 37 53 45C51 53 46 58 45 58C44 58 43 51 40 51C37 51 36 58 35 58C34 58 29 53 27 45C25 37 25 29 30 25Z" fill="#FFFFFF" stroke="#00ACC1" stroke-width="2.2" stroke-linejoin="round"/>
          <!-- Sparkle -->
          <path d="M47 28L49 33L54 35L49 37L47 42L45 37L40 35L45 33L47 28Z" fill="#E6007E"/>
        </svg>
      `;
    },

    // 9. Optics & Ophthalmology Illustration
    optics(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي للعيون والبصريات">
          <circle cx="40" cy="40" r="38" fill="#F0FDF4" stroke="#16A34A" stroke-width="2.5"/>
          <!-- Eye Shape -->
          <path d="M20 40C20 40 28 26 40 26C52 26 60 40 60 40C60 40 52 54 40 54C28 54 20 40 20 40Z" fill="#FFFFFF" stroke="#16A34A" stroke-width="2.2"/>
          <!-- Iris with WE Purple -->
          <circle cx="40" cy="40" r="9" fill="#5B2C82"/>
          <!-- Pupil -->
          <circle cx="40" cy="40" r="4.5" fill="#1E1B4B"/>
          <!-- Light reflection -->
          <circle cx="37" cy="37" r="2.2" fill="#FFFFFF"/>
        </svg>
      `;
    },

    // 10. Physical Therapy Illustration
    physio(size = 64) {
      return `
        <svg class="we-illustration" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم إيضاحي للعلاج الطبيعي">
          <circle cx="40" cy="40" r="38" fill="#FFF7ED" stroke="#EA580C" stroke-width="2.5"/>
          <!-- Spine & Posture Figure -->
          <circle cx="40" cy="22" r="5" fill="#5B2C82"/>
          <path d="M40 28C36 34 44 42 40 50" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
          <!-- Dynamic Healing Waves -->
          <path d="M26 38C28 35 32 35 34 38" stroke="#E6007E" stroke-width="2" stroke-linecap="round"/>
          <path d="M46 38C48 35 52 35 54 38" stroke="#E6007E" stroke-width="2" stroke-linecap="round"/>
          <path d="M24 45C27 42 33 42 36 45" stroke="#E6007E" stroke-width="2" stroke-linecap="round"/>
          <path d="M44 45C47 42 53 42 56 45" stroke="#E6007E" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    },

    // Helper: Get illustration by doctor or category
    getForEntity(entity, size = 64) {
      if (!entity) return this.doctorMale(size);
      
      const category = entity.category || '';
      const specialty = entity.specialty || '';
      const name = entity.display_name || entity.name || '';

      if (category === 'labs') return this.lab(size);
      if (category === 'radiology') return this.radiology(size);
      if (category === 'pharmacies') return this.pharmacy(size);
      if (category === 'dental') return this.dental(size);
      if (category === 'optics') return this.optics(size);
      if (category === 'hospitals') return this.hospital(size);
      if (category === 'emergency' || category === 'dialysis' || category === 'cardiology_center') return this.emergency(size);
      if (specialty.includes('علاج طبيعي') || category === 'home_care') return this.physio(size);
      if (specialty.includes('أسنان')) return this.dental(size);
      if (specialty.includes('عيون') || specialty.includes('رمد')) return this.optics(size);

      // Distinguish female doctors by common Arabic female names and prefixes
      const femaleKeywords = ['دكتورة', 'طبيبة', 'سارة', 'فاطمة', 'مروة', 'نهى', 'رانيا', 'أمل', 'شيماء', 'منى', 'دينا', 'إيمان', 'هدى', 'هبة', 'نجلاء', 'ياسمين', 'دعاء', 'رحاب', 'ولاء', 'سلوى', 'عبير', 'غادة', 'سحر', 'أميرة', 'نادية', 'أسماء', 'هالة', 'منال', 'وفاء', 'سمر', 'عزة', 'هند', 'مريم', 'إسراء', 'أماني', 'صفاء', 'إلهام', 'حنان'];
      const isFemale = femaleKeywords.some(kw => name.includes(kw));

      return isFemale ? this.doctorFemale(size) : this.doctorMale(size);
    }
  };

  window.MedicalIllustrations = Illustrations;
})(window);
