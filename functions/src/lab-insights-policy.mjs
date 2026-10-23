export const insightsFeature=Object.freeze({id:'review_insights',proposal:'R01 / X10 / M01',phase:'P6',title:'صوت الأعضاء · قراءة التقييمات',description:'مؤشرات من التقييمات المنشورة وعناصر الخدمة، دون أسماء أو نصوص الأعضاء أو قرارات نشر.',previewRevision:'review-insights-20261023-1',dataMode:'review-insights-readonly'});
export const insightsLimit=2000;
export const insightsMinimum=5;
// author_id is an opaque deduplication key used only inside the service.
export const insightsFields=Object.freeze(['author_id','target_id','status','rating','criteria','updated_at','revision']);
