/**
 * GridDown Medical Module - Offline Wilderness Medicine Reference
 * Curated database of wilderness medicine, drug interactions, and trauma protocols
 * 
 * DISCLAIMER: This information is for educational reference only and is not a 
 * substitute for professional medical training or emergency medical care.
 * Always seek professional medical help when available.
 */
const MedicalModule = (function() {
    'use strict';

    // Medical database organized by category
    const MEDICAL_DATABASE = {
        
        // =====================================================
        // TRAUMA & BLEEDING
        // =====================================================
        trauma: {
            name: 'Trauma & Bleeding',
            icon: '🩸',
            color: '#ef4444',
            items: [
                {
                    id: 'severe-bleeding',
                    title: 'Severe Bleeding Control',
                    severity: 'critical',
                    keywords: ['hemorrhage', 'bleeding', 'blood loss', 'tourniquet', 'wound'],
                    summary: 'Life-threatening bleeding requires immediate direct pressure and possibly a tourniquet.',
                    protocol: [
                        'Ensure scene safety and wear gloves if available',
                        'Apply direct pressure with clean cloth or gauze',
                        'If blood soaks through, add more material - do NOT remove',
                        'Elevate injured limb above heart level if possible',
                        'For limb wounds not controlled by pressure: apply tourniquet 2-3 inches above wound',
                        'Note time tourniquet applied - do NOT remove in field',
                        'Pack deep wounds tightly with gauze, maintain pressure',
                        'Monitor for shock: pale skin, rapid pulse, confusion'
                    ],
                    notes: 'Tourniquet myth: Modern evidence shows tourniquets are safe for several hours. Apply tight enough to stop bleeding completely.',
                    equipment: ['Tourniquet (CAT, SOFT-T)', 'Hemostatic gauze (QuikClot, Celox)', 'Pressure bandage', 'Nitrile gloves']
                },
                {
                    id: 'tourniquet-application',
                    title: 'Tourniquet Application',
                    severity: 'critical',
                    keywords: ['tourniquet', 'cat', 'soft-t', 'limb bleeding'],
                    summary: 'Proper tourniquet placement for uncontrolled limb hemorrhage.',
                    protocol: [
                        'Place tourniquet 2-3 inches above the wound (not on joint)',
                        'Pull strap tight through buckle',
                        'Twist windlass until bleeding stops completely',
                        'Lock windlass in clip/holder',
                        'Secure loose strap end',
                        'Write time on tourniquet or patient forehead with marker',
                        'Do NOT loosen or remove - leave for medical personnel',
                        'If first tourniquet doesn\'t control bleeding, apply second above first'
                    ],
                    notes: 'High and tight for junctional wounds (groin, armpit). One tourniquet may not be enough for large patients.',
                    equipment: ['CAT tourniquet', 'SOFT-T tourniquet', 'Sharpie marker']
                },
                {
                    id: 'wound-packing',
                    title: 'Wound Packing',
                    severity: 'high',
                    keywords: ['wound packing', 'deep wound', 'gauze', 'hemostatic'],
                    summary: 'Packing deep wounds to control bleeding from areas where tourniquets cannot be applied.',
                    protocol: [
                        'Expose the wound completely',
                        'Identify the source of bleeding if possible',
                        'Pack gauze directly into wound, starting at bleeding source',
                        'Pack tightly - use fingers to push gauze deep',
                        'Continue packing until wound is completely filled',
                        'Apply direct pressure on top for minimum 3 minutes',
                        'Apply pressure bandage over packed wound',
                        'Do NOT remove packing - let medical personnel handle'
                    ],
                    notes: 'Hemostatic gauze (QuikClot, Celox) is preferred but plain gauze works. Pack firmly - it will be uncomfortable for patient.',
                    equipment: ['Hemostatic gauze', 'Plain gauze (kerlix)', 'Pressure bandage', 'Gloves']
                },
                {
                    id: 'fractures',
                    title: 'Fracture Management',
                    severity: 'high',
                    keywords: ['broken bone', 'fracture', 'splint', 'immobilize'],
                    summary: 'Stabilize suspected fractures to prevent further injury and reduce pain.',
                    protocol: [
                        'Check circulation below injury: pulse, sensation, movement',
                        'Do NOT attempt to realign bone unless no pulse below injury',
                        'Splint in position found - immobilize joint above and below',
                        'Pad splint material for comfort',
                        'Secure splint snugly but not tight enough to cut off circulation',
                        'Recheck circulation after splinting',
                        'Apply cold pack wrapped in cloth (20 min on, 20 min off)',
                        'Elevate if possible',
                        'Monitor for compartment syndrome: severe pain, numbness, pale/cold limb'
                    ],
                    notes: 'Open fractures (bone visible) require wound care first. Angulated fractures with no pulse may need gentle traction to restore circulation.',
                    equipment: ['SAM splint', 'Padding material', 'Triangular bandage', 'Elastic bandage', 'Cold pack']
                },
                {
                    id: 'chest-trauma',
                    title: 'Chest Trauma',
                    severity: 'critical',
                    keywords: ['chest wound', 'pneumothorax', 'sucking chest wound', 'rib fracture'],
                    summary: 'Penetrating or blunt chest trauma can be immediately life-threatening.',
                    protocol: [
                        'SUCKING CHEST WOUND (penetrating):',
                        '- Apply chest seal or occlusive dressing (plastic/foil) taped on 3 sides',
                        '- Leave one side open to allow air to escape',
                        '- Monitor for tension pneumothorax',
                        '',
                        'TENSION PNEUMOTHORAX signs:',
                        '- Increasing difficulty breathing',
                        '- Trachea deviated away from injured side',
                        '- Distended neck veins',
                        '- If suspected: burp the chest seal or needle decompression if trained',
                        '',
                        'RIB FRACTURES:',
                        '- Do NOT wrap chest tightly',
                        '- Encourage deep breathing to prevent pneumonia',
                        '- Position of comfort (usually sitting up)'
                    ],
                    notes: 'Check for exit wound on back. All penetrating chest trauma needs evacuation.',
                    equipment: ['Chest seal (Hyfin, Asherman)', 'Occlusive material (plastic wrap)', 'Tape']
                },
                {
                    id: 'head-injury',
                    title: 'Head Injury / TBI',
                    severity: 'critical',
                    keywords: ['head injury', 'concussion', 'tbi', 'skull fracture', 'brain'],
                    summary: 'Traumatic brain injury assessment and management.',
                    protocol: [
                        'Assume cervical spine injury - stabilize head/neck',
                        'Check AVPU: Alert, Voice, Pain, Unresponsive',
                        'Check pupils: equal, reactive to light',
                        '',
                        'DANGER SIGNS (evacuate immediately):',
                        '- Unequal pupils',
                        '- Clear fluid from ears/nose (CSF leak)',
                        '- Battle signs (bruising behind ears)',
                        '- Raccoon eyes (bruising around eyes)',
                        '- Decreasing consciousness',
                        '- Repeated vomiting',
                        '- Seizures',
                        '',
                        'MANAGEMENT:',
                        '- Keep head elevated 30° if no spinal injury',
                        '- Prevent hypoxia - maintain airway',
                        '- Control visible bleeding with gentle pressure',
                        '- Do NOT pack ears/nose if draining fluid',
                        '- Monitor neuro status every 15 minutes'
                    ],
                    notes: 'Any loss of consciousness, even brief, requires evacuation for evaluation. Delayed deterioration is common with brain bleeds.',
                    equipment: ['Cervical collar', 'Wound care supplies', 'Pen light']
                },
                {
                    id: 'spinal-injury',
                    title: 'Spinal Injury',
                    severity: 'critical',
                    keywords: ['spine', 'spinal cord', 'neck injury', 'paralysis', 'c-spine'],
                    summary: 'Suspected spinal injury requires immobilization to prevent permanent paralysis.',
                    protocol: [
                        'SUSPECT SPINAL INJURY if:',
                        '- Mechanism: fall >3x height, diving, vehicle accident, direct trauma',
                        '- Neck/back pain or tenderness',
                        '- Numbness, tingling, weakness in extremities',
                        '- Altered consciousness',
                        '',
                        'MANAGEMENT:',
                        '- Manual stabilization: hold head in neutral position',
                        '- Do NOT move patient unless immediate danger',
                        '- Log roll only if necessary (minimum 4 people ideal)',
                        '- Apply cervical collar if available',
                        '- Pad voids under neck and small of back',
                        '- Secure to backboard/litter for transport',
                        '',
                        'AIRWAY: If needed, use jaw thrust (not head tilt)'
                    ],
                    notes: 'In wilderness settings with long evacuation, clearing the spine may be appropriate if patient is alert, not intoxicated, has no distracting injuries, and has no midline tenderness.',
                    equipment: ['Cervical collar', 'Backboard/litter', 'Padding', 'Straps']
                },
                {
                    id: 'burns',
                    title: 'Burn Treatment',
                    severity: 'high',
                    keywords: ['burn', 'thermal', 'chemical', 'scald', 'fire'],
                    summary: 'Burn assessment and treatment based on depth and body surface area.',
                    protocol: [
                        'STOP THE BURNING:',
                        '- Remove from source, remove clothing/jewelry',
                        '- Cool with cool (not cold) water for 10-20 minutes',
                        '- Do NOT use ice, butter, or other home remedies',
                        '',
                        'ASSESS DEPTH:',
                        '- Superficial (1st): Red, painful, no blisters',
                        '- Partial thickness (2nd): Blisters, very painful, red/white',
                        '- Full thickness (3rd): White/brown/black, leathery, minimal pain',
                        '',
                        'ASSESS SIZE (Rule of 9s for adults):',
                        '- Head: 9%, Each arm: 9%, Chest: 18%, Back: 18%',
                        '- Each leg: 18%, Groin: 1%',
                        '- Patient palm = 1% BSA',
                        '',
                        'TREATMENT:',
                        '- Cover with clean, dry dressing (non-adherent if available)',
                        '- Do NOT break blisters',
                        '- Elevate burned extremities',
                        '- Aggressive fluid replacement for burns >15% BSA'
                    ],
                    notes: 'Circumferential burns can cut off circulation - monitor closely. Face/airway burns may cause swelling - prepare for difficult airway.',
                    equipment: ['Burn dressing', 'Non-adherent gauze', 'Clean water', 'Pain medication']
                }
            ]
        },

        // =====================================================
        // ENVIRONMENTAL EMERGENCIES
        // =====================================================
        environmental: {
            name: 'Environmental',
            icon: '🌡️',
            color: '#3b82f6',
            items: [
                {
                    id: 'hypothermia',
                    title: 'Hypothermia',
                    severity: 'critical',
                    keywords: ['cold', 'hypothermia', 'freezing', 'shivering', 'core temperature'],
                    summary: 'Core body temperature drops below 95°F (35°C), potentially fatal.',
                    protocol: [
                        'MILD (90-95°F / 32-35°C):',
                        '- Shivering, impaired coordination',
                        '- Remove wet clothing, add dry insulation',
                        '- Give warm sweet drinks if alert',
                        '- Gentle exercise to generate heat',
                        '',
                        'MODERATE (82-90°F / 28-32°C):',
                        '- Shivering stops, confusion, slurred speech',
                        '- Handle gently - rough movement can trigger cardiac arrest',
                        '- Insulate from ground, cover head',
                        '- Apply heat packs to neck, armpits, groin (not directly on skin)',
                        '- No drinks if altered mental status',
                        '',
                        'SEVERE (<82°F / <28°C):',
                        '- Unconscious, may appear dead',
                        '- Check pulse for 60 seconds before starting CPR',
                        '- Evacuate immediately - field rewarming difficult',
                        '- "Not dead until warm and dead"'
                    ],
                    notes: 'Afterdrop: Core temp may continue dropping during rewarming as cold blood returns from extremities. Rewarm core first.',
                    equipment: ['Sleeping bag', 'Vapor barrier', 'Heat packs', 'Insulation', 'Warm fluids']
                },
                {
                    id: 'heat-exhaustion',
                    title: 'Heat Exhaustion',
                    severity: 'high',
                    keywords: ['heat', 'exhaustion', 'dehydration', 'sweating', 'hot'],
                    summary: 'Body overheating with intact thermoregulation - precursor to heat stroke.',
                    protocol: [
                        'SIGNS:',
                        '- Heavy sweating, weakness, nausea',
                        '- Headache, dizziness',
                        '- Pale, cool, moist skin',
                        '- Normal to slightly elevated temperature',
                        '- Mental status intact',
                        '',
                        'TREATMENT:',
                        '- Move to shade/cool area',
                        '- Remove excess clothing',
                        '- Lie down with legs elevated',
                        '- Cool with water, wet cloths, fanning',
                        '- Oral rehydration if alert: water + electrolytes',
                        '- Rest - no exertion for remainder of day minimum',
                        '',
                        'MONITOR for progression to heat stroke'
                    ],
                    notes: 'Prevention: Acclimatize gradually, hydrate before thirst, take breaks, use electrolytes.',
                    equipment: ['Shade structure', 'Water', 'Electrolyte mix', 'Spray bottle']
                },
                {
                    id: 'heat-stroke',
                    title: 'Heat Stroke',
                    severity: 'critical',
                    keywords: ['heat stroke', 'hyperthermia', 'hot', 'confusion', 'not sweating'],
                    summary: 'Life-threatening emergency - core temp >104°F with altered mental status.',
                    protocol: [
                        'SIGNS:',
                        '- Core temp >104°F (40°C)',
                        '- Altered mental status (confusion, combative, unconscious)',
                        '- May or may not be sweating',
                        '- Hot, flushed skin',
                        '- Rapid pulse, rapid breathing',
                        '',
                        'TREATMENT - COOL AGGRESSIVELY:',
                        '- This is a true emergency - cool first, transport second',
                        '- Remove clothing',
                        '- Ice water immersion if possible (best method)',
                        '- If no immersion: wet entire body + fan continuously',
                        '- Ice packs to neck, armpits, groin',
                        '- Do NOT give fluids if altered mental status',
                        '- Continue cooling until temp <102°F or mental status improves',
                        '- Evacuate urgently'
                    ],
                    notes: 'Every minute of delay increases organ damage risk. Mortality increases dramatically above 106°F. Cool first!',
                    equipment: ['Cold water', 'Ice', 'Tarp for immersion', 'Thermometer']
                },
                {
                    id: 'altitude-sickness',
                    title: 'Altitude Sickness (AMS/HACE/HAPE)',
                    severity: 'high',
                    keywords: ['altitude', 'mountain sickness', 'ams', 'hace', 'hape', 'elevation'],
                    summary: 'Spectrum of illness from mild AMS to life-threatening HACE/HAPE.',
                    protocol: [
                        'ACUTE MOUNTAIN SICKNESS (AMS):',
                        '- Headache + one of: nausea, fatigue, dizziness, poor sleep',
                        '- Treatment: Stop ascent, rest, hydrate, ibuprofen/acetaminophen',
                        '- Descend if symptoms worsen or don\'t improve in 24h',
                        '',
                        'HIGH ALTITUDE CEREBRAL EDEMA (HACE):',
                        '- AMS + ataxia (can\'t walk straight) or altered mental status',
                        '- IMMEDIATE DESCENT - this is life-threatening',
                        '- Dexamethasone 8mg then 4mg every 6h if available',
                        '- Supplemental oxygen',
                        '',
                        'HIGH ALTITUDE PULMONARY EDEMA (HAPE):',
                        '- Breathless at rest, dry cough, pink frothy sputum',
                        '- Crackles in lungs, cyanosis',
                        '- IMMEDIATE DESCENT',
                        '- Nifedipine 30mg extended-release if available',
                        '- Supplemental oxygen, keep warm, minimize exertion'
                    ],
                    notes: 'Prevention: Ascend slowly (<1000ft/day above 10,000ft), "climb high sleep low", acetazolamide (Diamox) 125mg BID starting 24h before ascent.',
                    equipment: ['Pulse oximeter', 'Dexamethasone', 'Nifedipine', 'Acetazolamide', 'Oxygen']
                },
                {
                    id: 'frostbite',
                    title: 'Frostbite',
                    severity: 'high',
                    keywords: ['frostbite', 'frozen', 'cold injury', 'fingers', 'toes'],
                    summary: 'Tissue freezing, typically affecting extremities.',
                    protocol: [
                        'FROSTNIP (superficial):',
                        '- Numbness, white/waxy skin, soft when pressed',
                        '- Rewarm with body heat (armpits, warm hands)',
                        '- No permanent damage expected',
                        '',
                        'FROSTBITE:',
                        '- Hard, frozen tissue; white/gray/blue color',
                        '- Do NOT rewarm if there\'s risk of refreezing (makes it worse)',
                        '- Do NOT rub or massage frozen tissue',
                        '',
                        'REWARMING (only if no refreezing risk):',
                        '- Water bath 98.6-102°F (37-39°C)',
                        '- Takes 30-60 minutes until tissue is soft and red/purple',
                        '- Extremely painful - give strongest pain meds available',
                        '- After rewarming: loosely bandage, separate digits',
                        '- Do NOT break blisters',
                        '- Ibuprofen for anti-inflammatory effect'
                    ],
                    notes: 'Frozen tissue is surprisingly durable for travel. Better to walk out on frozen feet than rewarm and be unable to move. Avoid alcohol and tobacco.',
                    equipment: ['Thermometer', 'Warm water container', 'Pain medication', 'Loose bandages', 'Ibuprofen']
                },
                {
                    id: 'lightning',
                    title: 'Lightning Strike',
                    severity: 'critical',
                    keywords: ['lightning', 'electrical', 'thunder', 'storm'],
                    summary: 'Lightning strike injury assessment and treatment.',
                    protocol: [
                        'SCENE SAFETY:',
                        '- If storm ongoing, move victim only if safe to do so',
                        '- Lightning can strike twice in same location',
                        '',
                        'ASSESSMENT:',
                        '- Lightning victims are safe to touch immediately',
                        '- Primary cause of death: cardiac arrest',
                        '- Check breathing and pulse',
                        '',
                        'TREATMENT:',
                        '- Begin CPR immediately if no pulse - survival rates better than other cardiac arrest',
                        '- Treat multiple victims: prioritize those who appear dead (reverse triage)',
                        '- Look for entry/exit burns',
                        '- Assume spinal injury if patient was thrown',
                        '- Monitor for: ruptured eardrums, eye injuries, confusion',
                        '',
                        'All lightning strike victims need medical evaluation'
                    ],
                    notes: 'Prevention: 30/30 rule - shelter when lightning-to-thunder <30 seconds, stay sheltered 30 minutes after last thunder.',
                    equipment: ['CPR capability', 'Burn supplies', 'Spinal precautions']
                },
                {
                    id: 'drowning',
                    title: 'Drowning / Submersion',
                    severity: 'critical',
                    keywords: ['drowning', 'submersion', 'water', 'swimming', 'near drowning'],
                    summary: 'Water submersion causing respiratory impairment.',
                    protocol: [
                        'RESCUE:',
                        '- Reach, throw, row, then go (protect yourself)',
                        '- Assume spinal injury if diving or mechanism unknown',
                        '',
                        'IMMEDIATE CARE:',
                        '- Remove from water horizontally if possible',
                        '- If not breathing, begin rescue breaths immediately',
                        '- If no pulse, begin CPR',
                        '- Do NOT attempt to drain water from lungs',
                        '- Abdominal thrusts not recommended',
                        '',
                        'POST-RESCUE:',
                        '- All submersion victims need medical evaluation',
                        '- Remove wet clothing, prevent hypothermia',
                        '- Monitor closely - can deteriorate hours later',
                        '- Supplemental oxygen if available',
                        '- Position: if breathing, recovery position'
                    ],
                    notes: 'Fresh vs salt water: clinically not different in treatment. Cold water drowning: continue CPR longer - hypothermia is protective.',
                    equipment: ['Throw rope', 'PFD', 'Rescue breathing barrier', 'Dry clothes/blankets']
                }
            ]
        },

        // =====================================================
        // MEDICAL EMERGENCIES
        // =====================================================
        medical: {
            name: 'Medical Emergencies',
            icon: '💊',
            color: '#8b5cf6',
            items: [
                {
                    id: 'anaphylaxis',
                    title: 'Anaphylaxis',
                    severity: 'critical',
                    keywords: ['allergy', 'anaphylaxis', 'allergic reaction', 'epipen', 'swelling'],
                    summary: 'Severe allergic reaction that can rapidly become life-threatening.',
                    protocol: [
                        'SIGNS:',
                        '- Hives, itching, flushing',
                        '- Swelling of face, lips, tongue, throat',
                        '- Difficulty breathing, wheezing',
                        '- Rapid pulse, dizziness, feeling of doom',
                        '- Nausea, vomiting, abdominal pain',
                        '',
                        'TREATMENT:',
                        '- EPINEPHRINE is the only life-saving treatment',
                        '- EpiPen: Remove cap, jab into outer thigh (through clothing OK)',
                        '- Hold for 10 seconds',
                        '- If no improvement in 5-15 minutes, give second dose',
                        '- Position: sitting up if breathing difficulty, legs elevated if shock',
                        '- Give antihistamine (Benadryl 50mg) - but NOT instead of epi',
                        '- Evacuate - biphasic reaction can occur hours later'
                    ],
                    notes: 'Epinephrine has no contraindications in anaphylaxis - give it even if patient has heart conditions. Effects last only 15-20 minutes.',
                    equipment: ['Epinephrine auto-injector', 'Diphenhydramine (Benadryl)', 'Second epi dose']
                },
                {
                    id: 'asthma',
                    title: 'Asthma Attack',
                    severity: 'high',
                    keywords: ['asthma', 'wheezing', 'inhaler', 'breathing', 'bronchospasm'],
                    summary: 'Acute bronchospasm causing breathing difficulty.',
                    protocol: [
                        'SIGNS:',
                        '- Wheezing, shortness of breath',
                        '- Chest tightness, coughing',
                        '- Difficulty speaking in full sentences',
                        '- Using accessory muscles to breathe',
                        '',
                        'TREATMENT:',
                        '- Sit patient upright',
                        '- Assist with their rescue inhaler (albuterol)',
                        '- Shake inhaler, 2 puffs with spacer if available',
                        '- Can repeat every 20 minutes up to 3 times',
                        '- Stay calm - anxiety worsens bronchospasm',
                        '',
                        'SEVERE ATTACK (needs evacuation):',
                        '- No improvement with inhaler',
                        '- Can\'t speak, blue lips',
                        '- Silent chest (too tight to wheeze)',
                        '- Epinephrine can be used for severe attack'
                    ],
                    notes: 'Caffeine has mild bronchodilator effect. Cold air can trigger attacks - breathe through buff/scarf.',
                    equipment: ['Rescue inhaler (albuterol)', 'Spacer', 'Epinephrine for severe cases']
                },
                {
                    id: 'diabetic-emergency',
                    title: 'Diabetic Emergency',
                    severity: 'critical',
                    keywords: ['diabetes', 'blood sugar', 'hypoglycemia', 'hyperglycemia', 'insulin'],
                    summary: 'Blood sugar too low (hypoglycemia) or too high (hyperglycemia).',
                    protocol: [
                        'HYPOGLYCEMIA (low blood sugar) - MORE COMMON EMERGENCY:',
                        '- Rapid onset: shaking, sweating, confusion, irritability',
                        '- May progress to unconsciousness/seizures',
                        '- Treatment: GIVE SUGAR immediately',
                        '- If conscious: juice, candy, glucose tabs (15-20g sugar)',
                        '- If unconscious: glucose gel rubbed on gums',
                        '- Glucagon injection if available and trained',
                        '- Response should occur in 10-15 minutes',
                        '',
                        'HYPERGLYCEMIA (high blood sugar):',
                        '- Gradual onset: thirst, frequent urination, nausea',
                        '- Fruity breath odor (ketoacidosis)',
                        '- Treatment requires insulin - evacuate',
                        '- Encourage water intake if conscious',
                        '',
                        'IF UNSURE: Give sugar - it won\'t significantly harm high blood sugar but will save a hypoglycemic'
                    ],
                    notes: 'Known diabetic altered mental status = give sugar. Check for medical ID bracelet/necklace.',
                    equipment: ['Glucose tablets/gel', 'Glucagon kit', 'Juice boxes', 'Candy']
                },
                {
                    id: 'seizure',
                    title: 'Seizure',
                    severity: 'high',
                    keywords: ['seizure', 'convulsion', 'epilepsy', 'fitting'],
                    summary: 'Abnormal electrical brain activity causing involuntary movements.',
                    protocol: [
                        'DURING SEIZURE:',
                        '- Protect from injury: move away from hazards',
                        '- Do NOT restrain - let it run its course',
                        '- Do NOT put anything in mouth',
                        '- Time the seizure - important information',
                        '- Place something soft under head',
                        '',
                        'AFTER SEIZURE (postictal phase):',
                        '- Place in recovery position',
                        '- Patient will be confused, sleepy - this is normal',
                        '- Stay with them until fully alert',
                        '- Check for injuries, incontinence',
                        '',
                        'EVACUATE IF:',
                        '- First seizure ever',
                        '- Seizure >5 minutes',
                        '- Multiple seizures without full recovery',
                        '- Seizure in water',
                        '- Pregnant',
                        '- Known diabetic',
                        '- Significant injury during seizure'
                    ],
                    notes: 'Known epileptic with typical seizure who recovers fully may not need evacuation if they have medication and this is their normal pattern.',
                    equipment: ['Padding', 'Watch/timer', 'Recovery position aids']
                },
                {
                    id: 'chest-pain',
                    title: 'Chest Pain / Heart Attack',
                    severity: 'critical',
                    keywords: ['heart attack', 'cardiac', 'chest pain', 'mi', 'myocardial'],
                    summary: 'Potential cardiac emergency requiring immediate action.',
                    protocol: [
                        'HEART ATTACK SIGNS:',
                        '- Chest pressure, squeezing, heaviness (not sharp)',
                        '- Pain radiating to jaw, arm, back',
                        '- Shortness of breath',
                        '- Nausea, sweating, feeling of doom',
                        '- Women may have atypical symptoms: fatigue, nausea only',
                        '',
                        'TREATMENT:',
                        '- Stop all activity, rest in position of comfort',
                        '- Aspirin 324mg (4 baby aspirin) - chew, don\'t swallow whole',
                        '- Nitroglycerin if prescribed and BP not low',
                        '- Loosen tight clothing',
                        '- Calm reassurance - anxiety increases oxygen demand',
                        '- Be prepared for CPR',
                        '- Evacuate immediately - time is heart muscle'
                    ],
                    notes: 'Not all chest pain is cardiac - but treat as cardiac until proven otherwise. Aspirin reduces mortality if given early.',
                    equipment: ['Aspirin', 'Patient\'s own medications', 'CPR capability']
                },
                {
                    id: 'stroke',
                    title: 'Stroke',
                    severity: 'critical',
                    keywords: ['stroke', 'cva', 'facial droop', 'weakness', 'speech'],
                    summary: 'Brain attack from blocked or bleeding vessel - time critical.',
                    protocol: [
                        'RECOGNIZE STROKE (BE FAST):',
                        '- Balance: sudden dizziness, loss of coordination',
                        '- Eyes: vision changes',
                        '- Face: facial droop (ask to smile)',
                        '- Arms: arm weakness (raise both arms)',
                        '- Speech: slurred or confused speech',
                        '- Time: note time symptoms started',
                        '',
                        'TREATMENT:',
                        '- Time is critical - brain cells dying every minute',
                        '- Do NOT give aspirin (could be bleeding stroke)',
                        '- Position: head elevated 30°',
                        '- Nothing by mouth (swallowing may be impaired)',
                        '- Protect airway - may vomit',
                        '- Calm reassurance',
                        '- Evacuate immediately',
                        '',
                        'Note exact time of symptom onset - affects treatment options'
                    ],
                    notes: 'Treatment with clot-busting drugs most effective within 3 hours. Evacuation is the treatment.',
                    equipment: ['Evacuation capability', 'Airway management', 'Suction if available']
                },
                {
                    id: 'abdominal-pain',
                    title: 'Abdominal Emergencies',
                    severity: 'high',
                    keywords: ['abdomen', 'stomach', 'appendicitis', 'abdominal pain'],
                    summary: 'Assessment of potentially serious abdominal conditions.',
                    protocol: [
                        'RED FLAGS (evacuate immediately):',
                        '- Rigid, board-like abdomen',
                        '- Severe pain that suddenly becomes painless (perforation)',
                        '- Blood in vomit or stool',
                        '- Fever with severe abdominal pain',
                        '- Pain that started around umbilicus and moved to right lower quadrant (appendicitis)',
                        '- Signs of shock with abdominal pain',
                        '',
                        'ASSESSMENT:',
                        '- Location of pain',
                        '- Character (crampy vs constant)',
                        '- Associated symptoms (N/V, fever, bowel changes)',
                        '- Last bowel movement, last meal',
                        '- Menstrual history if applicable',
                        '',
                        'GENERAL MANAGEMENT:',
                        '- NPO (nothing by mouth) if serious condition suspected',
                        '- Position of comfort (usually knees bent)',
                        '- Monitor vital signs',
                        '- Pain medication may mask important findings'
                    ],
                    notes: 'Abdominal pain in wilderness requires evacuation if not clearly minor (like gas or known condition). Peritonitis is life-threatening.',
                    equipment: ['Thermometer', 'Pain medication (if long evacuation)', 'IV fluids if trained']
                }
            ]
        },

        // =====================================================
        // BITES & STINGS
        // =====================================================
        bites: {
            name: 'Bites & Stings',
            icon: '🐍',
            color: '#22c55e',
            items: [
                {
                    id: 'snake-bite',
                    title: 'Snake Bite',
                    severity: 'high',
                    keywords: ['snake', 'bite', 'venom', 'rattlesnake', 'pit viper'],
                    summary: 'Venomous snake bite management and evacuation.',
                    protocol: [
                        'DO:',
                        '- Remove from striking range of snake',
                        '- Keep patient calm and still - movement spreads venom',
                        '- Remove jewelry/watches before swelling',
                        '- Splint bitten extremity, keep at or below heart level',
                        '- Mark edge of swelling with pen and time',
                        '- Clean wound gently',
                        '- Evacuate - all venomous bites need antivenin evaluation',
                        '',
                        'DO NOT:',
                        '- Cut and suck',
                        '- Apply tourniquet',
                        '- Apply ice',
                        '- Apply electric shock',
                        '- Give alcohol',
                        '- Try to catch the snake',
                        '',
                        'Monitor for: spreading swelling, bruising, nausea, weakness, difficulty breathing'
                    ],
                    notes: '25% of pit viper bites are "dry" (no venom). Still evacuate. Take photo of snake if safe to do so. Most important factor is rapid evacuation.',
                    equipment: ['Splint material', 'Marker pen', 'Watch for timing', 'Wound care']
                },
                {
                    id: 'spider-bite',
                    title: 'Spider Bite',
                    severity: 'moderate',
                    keywords: ['spider', 'black widow', 'brown recluse', 'bite'],
                    summary: 'Management of potentially venomous spider bites.',
                    protocol: [
                        'BLACK WIDOW:',
                        '- Immediate pain, redness, two fang marks',
                        '- Muscle cramps spreading from bite, abdominal rigidity',
                        '- Headache, nausea, sweating',
                        '- Clean wound, apply ice pack',
                        '- Pain medication (muscle relaxants help)',
                        '- Evacuate - antivenin available for severe cases',
                        '',
                        'BROWN RECLUSE:',
                        '- Often painless initially',
                        '- "Bulls-eye" lesion develops over hours/days',
                        '- Can cause significant tissue death',
                        '- Clean wound, apply cool compress',
                        '- Evacuate if signs of systemic illness',
                        '',
                        'GENERAL:',
                        '- Most spider bites are harmless',
                        '- If possible, capture/photograph spider safely',
                        '- Watch for signs of infection'
                    ],
                    notes: 'Many "spider bites" are actually other conditions (MRSA, etc.). Seek care if wound worsens over 24-48 hours.',
                    equipment: ['Ice pack', 'Pain medication', 'Wound care supplies']
                },
                {
                    id: 'bee-wasp-sting',
                    title: 'Bee & Wasp Stings',
                    severity: 'moderate',
                    keywords: ['bee', 'wasp', 'sting', 'hornet', 'yellow jacket'],
                    summary: 'Treatment of stings and monitoring for allergic reaction.',
                    protocol: [
                        'NORMAL REACTION:',
                        '- Pain, redness, swelling at site',
                        '- Remove stinger quickly (scrape, don\'t squeeze)',
                        '- Clean area with soap and water',
                        '- Ice pack for swelling',
                        '- Antihistamine (Benadryl) for itching',
                        '- Pain reliever as needed',
                        '',
                        'LARGE LOCAL REACTION:',
                        '- Swelling extending beyond sting site',
                        '- Still not anaphylaxis',
                        '- Antihistamine, ice, elevation',
                        '- Consider steroids if available',
                        '',
                        'WATCH FOR ANAPHYLAXIS:',
                        '- Hives away from sting site',
                        '- Swelling of face/throat',
                        '- Difficulty breathing',
                        '- See Anaphylaxis protocol'
                    ],
                    notes: 'Multiple stings (>10-20) can cause systemic toxicity even without allergy. Known allergic individuals should carry epinephrine.',
                    equipment: ['Stiff card for stinger removal', 'Ice pack', 'Antihistamine', 'Epinephrine for allergic individuals']
                },
                {
                    id: 'tick-bite',
                    title: 'Tick Bite & Removal',
                    severity: 'low',
                    keywords: ['tick', 'lyme disease', 'rocky mountain spotted fever'],
                    summary: 'Proper tick removal and disease monitoring.',
                    protocol: [
                        'REMOVAL:',
                        '- Use fine-tipped tweezers',
                        '- Grasp tick as close to skin as possible',
                        '- Pull upward with steady, even pressure',
                        '- Don\'t twist or jerk (may break mouthparts)',
                        '- Don\'t squeeze tick body',
                        '',
                        'AFTER REMOVAL:',
                        '- Clean bite area with alcohol or soap/water',
                        '- Save tick in sealed container (for ID if illness develops)',
                        '- Note date of bite',
                        '',
                        'DO NOT:',
                        '- Use petroleum jelly, nail polish, or heat',
                        '- Wait for tick to detach on its own',
                        '',
                        'MONITOR FOR (2-30 days after bite):',
                        '- Expanding rash (especially "bulls-eye")',
                        '- Fever, fatigue, headache, muscle aches',
                        '- Seek care if symptoms develop'
                    ],
                    notes: 'Disease transmission usually requires attachment for 24-48+ hours. Regular tick checks are important prevention.',
                    equipment: ['Fine-tipped tweezers', 'Alcohol wipes', 'Small container for tick']
                },
                {
                    id: 'animal-bite',
                    title: 'Animal Bite / Rabies',
                    severity: 'high',
                    keywords: ['bite', 'animal', 'rabies', 'dog', 'wild animal'],
                    summary: 'Wound care and rabies risk assessment.',
                    protocol: [
                        'IMMEDIATE CARE:',
                        '- Control bleeding with direct pressure',
                        '- Wash wound thoroughly with soap and water for 15 minutes',
                        '- This significantly reduces rabies risk',
                        '- Irrigate deeply if possible',
                        '- Apply antibiotic ointment',
                        '- Bandage loosely',
                        '',
                        'RABIES RISK ASSESSMENT:',
                        '- HIGH risk: bats, raccoons, skunks, foxes, coyotes',
                        '- MODERATE: dogs/cats (depends on vaccination status)',
                        '- LOW: squirrels, rabbits, rodents',
                        '- Unprovoked attack = higher risk',
                        '',
                        'EVACUATE FOR:',
                        '- Any bite from high-risk animal',
                        '- Bite to face or hands',
                        '- Deep puncture wounds',
                        '- Signs of infection (redness, swelling, pus)',
                        '',
                        'Rabies is 100% fatal once symptoms start - when in doubt, evacuate'
                    ],
                    notes: 'If possible and safe, observe or contain animal for 10 days (dogs/cats). Bats: if bat was in room while sleeping, assume exposure.',
                    equipment: ['Soap', 'Water for irrigation', 'Antibiotic ointment', 'Bandages']
                }
            ]
        },

        // =====================================================
        // MEDICATIONS REFERENCE
        // =====================================================
        medications: {
            name: 'Medications',
            icon: '💉',
            color: '#f59e0b',
            items: [
                {
                    id: 'pain-meds',
                    title: 'Pain Medications',
                    severity: 'info',
                    keywords: ['pain', 'ibuprofen', 'acetaminophen', 'tylenol', 'advil', 'analgesic'],
                    summary: 'Over-the-counter and common prescription pain medications.',
                    protocol: [
                        'ACETAMINOPHEN (Tylenol):',
                        '- Dose: 500-1000mg every 6 hours (max 3000mg/day)',
                        '- Good for: pain, fever',
                        '- Caution: liver toxicity in overdose, avoid with alcohol',
                        '- Does NOT reduce inflammation',
                        '',
                        'IBUPROFEN (Advil, Motrin):',
                        '- Dose: 400-800mg every 6-8 hours with food (max 2400mg/day)',
                        '- Good for: pain, fever, inflammation, altitude sickness',
                        '- Caution: GI bleeding, kidney issues, avoid if dehydrated',
                        '',
                        'NAPROXEN (Aleve):',
                        '- Dose: 220-440mg every 12 hours with food (max 660mg/day)',
                        '- Longer lasting than ibuprofen',
                        '- Same cautions as ibuprofen',
                        '',
                        'COMBINING:',
                        '- Can alternate ibuprofen and acetaminophen safely',
                        '- Do NOT combine ibuprofen with naproxen (both NSAIDs)'
                    ],
                    notes: 'Acetaminophen and ibuprofen together are often more effective than either alone. Stay hydrated when using NSAIDs.',
                    equipment: ['Acetaminophen', 'Ibuprofen', 'Naproxen']
                },
                {
                    id: 'allergy-meds',
                    title: 'Allergy Medications',
                    severity: 'info',
                    keywords: ['allergy', 'antihistamine', 'benadryl', 'zyrtec', 'claritin'],
                    summary: 'Antihistamines for allergic reactions.',
                    protocol: [
                        'DIPHENHYDRAMINE (Benadryl):',
                        '- Dose: 25-50mg every 6 hours',
                        '- Fast-acting, good for acute reactions',
                        '- Causes drowsiness - useful as sleep aid',
                        '- Caution: impairs coordination, dry mouth',
                        '',
                        'CETIRIZINE (Zyrtec):',
                        '- Dose: 10mg once daily',
                        '- Less sedating than Benadryl',
                        '- Good for ongoing allergies',
                        '',
                        'LORATADINE (Claritin):',
                        '- Dose: 10mg once daily',
                        '- Non-sedating',
                        '- Takes longer to work',
                        '',
                        'FOR ANAPHYLAXIS:',
                        '- Antihistamines are NOT enough',
                        '- EPINEPHRINE is required',
                        '- Antihistamines can be given after epinephrine'
                    ],
                    notes: 'Benadryl causes significant impairment - don\'t operate vehicles or do technical activities. Use non-sedating options during the day.',
                    equipment: ['Diphenhydramine', 'Cetirizine or Loratadine']
                },
                {
                    id: 'gi-meds',
                    title: 'GI Medications',
                    severity: 'info',
                    keywords: ['diarrhea', 'nausea', 'vomiting', 'stomach', 'antacid', 'imodium'],
                    summary: 'Medications for gastrointestinal issues.',
                    protocol: [
                        'LOPERAMIDE (Imodium):',
                        '- Dose: 4mg initially, then 2mg after each loose stool (max 16mg/day)',
                        '- Slows gut motility',
                        '- Caution: avoid if bloody diarrhea or fever (may be bacterial)',
                        '',
                        'BISMUTH SUBSALICYLATE (Pepto-Bismol):',
                        '- Dose: 30ml or 2 tablets every 30-60 min (max 8 doses/day)',
                        '- Good for traveler\'s diarrhea, nausea',
                        '- Will turn stool/tongue black (normal)',
                        '- Avoid with aspirin allergy',
                        '',
                        'ONDANSETRON (Zofran, Rx):',
                        '- Dose: 4-8mg every 8 hours',
                        '- Excellent for nausea/vomiting',
                        '- Does not cause drowsiness',
                        '',
                        'OMEPRAZOLE (Prilosec):',
                        '- Dose: 20mg once daily',
                        '- For heartburn/acid reflux',
                        '- Takes a few days for full effect'
                    ],
                    notes: 'Diarrhea causes dehydration - oral rehydration (water + electrolytes) is most important treatment. Antibiotics may be needed for traveler\'s diarrhea.',
                    equipment: ['Loperamide', 'Bismuth subsalicylate', 'Ondansetron', 'Oral rehydration salts']
                },
                {
                    id: 'antibiotics',
                    title: 'Antibiotics (Prescription)',
                    severity: 'info',
                    keywords: ['antibiotic', 'infection', 'amoxicillin', 'azithromycin', 'cipro'],
                    summary: 'Common antibiotics for wilderness medical kits.',
                    protocol: [
                        'AMOXICILLIN-CLAVULANATE (Augmentin):',
                        '- Dose: 875/125mg twice daily',
                        '- Good for: skin infections, animal bites, dental infections',
                        '- Penicillin allergy = do not use',
                        '',
                        'AZITHROMYCIN (Z-Pack):',
                        '- Dose: 500mg day 1, then 250mg days 2-5',
                        '- Good for: respiratory infections, traveler\'s diarrhea',
                        '- Safe in penicillin allergy',
                        '',
                        'CIPROFLOXACIN (Cipro):',
                        '- Dose: 500mg twice daily',
                        '- Good for: traveler\'s diarrhea, UTI',
                        '- Caution: tendon problems, sun sensitivity',
                        '',
                        'TRIMETHOPRIM-SULFAMETHOXAZOLE (Bactrim):',
                        '- Dose: 160/800mg twice daily',
                        '- Good for: UTI, skin infections (including MRSA)',
                        '- Sulfa allergy = do not use',
                        '',
                        'Complete the full course even if feeling better'
                    ],
                    notes: 'Antibiotics require prescription. Discuss wilderness medical kit with physician before trip. Misuse contributes to resistance.',
                    equipment: ['Prescribed antibiotics', 'Physician guidance']
                },
                {
                    id: 'altitude-meds',
                    title: 'Altitude Medications',
                    severity: 'info',
                    keywords: ['altitude', 'diamox', 'acetazolamide', 'dexamethasone', 'nifedipine'],
                    summary: 'Medications for altitude illness prevention and treatment.',
                    protocol: [
                        'ACETAZOLAMIDE (Diamox) - Prevention:',
                        '- Dose: 125mg twice daily, starting 24h before ascent',
                        '- Speeds acclimatization',
                        '- Side effects: tingling, frequent urination, altered taste',
                        '- Sulfa allergy = use caution',
                        '',
                        'DEXAMETHASONE (Decadron) - Treatment:',
                        '- Dose: 8mg initially, then 4mg every 6 hours',
                        '- For HACE or severe AMS when descent delayed',
                        '- Does NOT help acclimatization - masks symptoms',
                        '- Must still descend',
                        '',
                        'NIFEDIPINE - Treatment:',
                        '- Dose: 30mg extended-release every 12 hours',
                        '- For HAPE',
                        '- Lowers pulmonary artery pressure',
                        '- Can cause headache, dizziness',
                        '',
                        'IBUPROFEN:',
                        '- 600mg every 8 hours can help prevent/treat AMS headache'
                    ],
                    notes: 'Descent is always the best treatment. Medications buy time for descent. Acetazolamide enhances acclimatization; dexamethasone just masks symptoms.',
                    equipment: ['Acetazolamide', 'Dexamethasone', 'Nifedipine', 'Pulse oximeter']
                },
                {
                    id: 'drug-interactions',
                    title: 'Common Drug Interactions',
                    severity: 'info',
                    keywords: ['interaction', 'drug interaction', 'contraindication'],
                    summary: 'Important medication interactions to avoid.',
                    protocol: [
                        'NSAIDS (Ibuprofen, Naproxen):',
                        '- + Blood thinners (warfarin) = increased bleeding',
                        '- + ACE inhibitors = reduced BP effect, kidney risk',
                        '- + Other NSAIDs = increased GI bleeding risk',
                        '- + Lithium = lithium toxicity',
                        '',
                        'ACETAMINOPHEN:',
                        '- + Alcohol = liver damage',
                        '- + Warfarin = increased bleeding risk',
                        '',
                        'ANTIHISTAMINES (Benadryl):',
                        '- + Alcohol = increased sedation',
                        '- + Other sedatives = additive effects',
                        '',
                        'FLUOROQUINOLONES (Cipro):',
                        '- + Antacids, calcium, iron = reduced absorption',
                        '- + NSAIDs = increased seizure risk',
                        '- + Steroids = increased tendon rupture risk',
                        '',
                        'GENERAL:',
                        '- Always know what medications someone takes',
                        '- When in doubt, don\'t combine medications'
                    ],
                    notes: 'This is not comprehensive. Always verify drug interactions when giving medications, especially to someone on chronic medications.',
                    equipment: ['Medication list for all party members']
                }
            ]
        },

        // =====================================================
        // ASSESSMENT & TRIAGE
        // =====================================================
        assessment: {
            name: 'Assessment',
            icon: '📋',
            color: '#06b6d4',
            items: [
                {
                    id: 'primary-survey',
                    title: 'Primary Survey (MARCH)',
                    severity: 'info',
                    keywords: ['primary survey', 'march', 'assessment', 'abcde', 'triage'],
                    summary: 'Initial rapid assessment to identify life threats.',
                    protocol: [
                        'M - MASSIVE HEMORRHAGE:',
                        '- Look for severe bleeding',
                        '- Control with tourniquet or pressure',
                        '',
                        'A - AIRWAY:',
                        '- Is airway open and clear?',
                        '- Head-tilt chin-lift (or jaw thrust if trauma)',
                        '- Clear obstructions',
                        '',
                        'R - RESPIRATION:',
                        '- Is patient breathing adequately?',
                        '- Look, listen, feel',
                        '- Check for chest wounds',
                        '',
                        'C - CIRCULATION:',
                        '- Check pulse (carotid or radial)',
                        '- Assess for shock (pale, cool, clammy)',
                        '- Control other bleeding',
                        '',
                        'H - HYPOTHERMIA/HEAD:',
                        '- Prevent heat loss',
                        '- Quick neuro check (AVPU)',
                        '',
                        'Address each problem as you find it before moving on'
                    ],
                    notes: 'MARCH is preferred in tactical/wilderness settings. Traditional ABCDE works similarly. Adapt to situation.',
                    equipment: ['Tourniquet', 'Airway adjuncts', 'Chest seal', 'Blanket']
                },
                {
                    id: 'vital-signs',
                    title: 'Vital Signs',
                    severity: 'info',
                    keywords: ['vital signs', 'pulse', 'respiration', 'blood pressure', 'temperature'],
                    summary: 'How to assess and interpret vital signs.',
                    protocol: [
                        'PULSE:',
                        '- Normal adult: 60-100 beats/minute',
                        '- Check radial (wrist) or carotid (neck)',
                        '- Count for 15 seconds × 4',
                        '- Note: regular vs irregular, strong vs weak',
                        '',
                        'RESPIRATION:',
                        '- Normal adult: 12-20 breaths/minute',
                        '- Watch chest rise, don\'t tell patient you\'re counting',
                        '- Note: labored, shallow, use of accessory muscles',
                        '',
                        'SKIN SIGNS (perfusion):',
                        '- Color: pink (normal), pale/gray (shock), blue (hypoxia)',
                        '- Temperature: warm (normal), cool (shock), hot (fever)',
                        '- Moisture: dry (normal), clammy (shock)',
                        '',
                        'AVPU (mental status):',
                        '- Alert',
                        '- Voice responsive',
                        '- Pain responsive',
                        '- Unresponsive',
                        '',
                        'Record vitals every 15-30 minutes and note trends'
                    ],
                    notes: 'Trends are more important than single readings. Vital signs in wilderness may differ from hospital norms.',
                    equipment: ['Watch with second hand', 'Thermometer', 'Blood pressure cuff (optional)', 'Pulse oximeter (optional)']
                },
                {
                    id: 'soap-notes',
                    title: 'SOAP Documentation',
                    severity: 'info',
                    keywords: ['documentation', 'soap', 'notes', 'record', 'patient care'],
                    summary: 'Standard format for documenting patient assessment.',
                    protocol: [
                        'S - SUBJECTIVE:',
                        '- Chief complaint in patient\'s words',
                        '- History of present illness',
                        '- OPQRST for pain (Onset, Provokes/Palliates, Quality, Radiates, Severity, Time)',
                        '- SAMPLE (Symptoms, Allergies, Medications, Past medical, Last intake, Events)',
                        '',
                        'O - OBJECTIVE:',
                        '- Vital signs with time',
                        '- Physical exam findings',
                        '- What you observe (not what patient reports)',
                        '',
                        'A - ASSESSMENT:',
                        '- Your working diagnosis/problem list',
                        '',
                        'P - PLAN:',
                        '- What you did',
                        '- What you plan to do',
                        '- Evacuation plan if needed',
                        '',
                        'Document everything - it helps next providers and protects you'
                    ],
                    notes: 'Use any paper available. Send documentation with patient during evacuation. Include responder names and times.',
                    equipment: ['Paper', 'Pen', 'Waterproof notebook']
                },
                {
                    id: 'triage',
                    title: 'Mass Casualty Triage',
                    severity: 'info',
                    keywords: ['triage', 'mci', 'start', 'mass casualty'],
                    summary: 'Rapid triage system for multiple patients.',
                    protocol: [
                        'START TRIAGE:',
                        '',
                        '1. Can patient walk? → GREEN (Minor)',
                        '',
                        '2. Check breathing:',
                        '   - Not breathing → Open airway → Still not breathing → BLACK (Deceased)',
                        '   - Breathing after airway opened → RED (Immediate)',
                        '   - Respiratory rate >30 → RED (Immediate)',
                        '',
                        '3. Check perfusion:',
                        '   - Radial pulse absent OR cap refill >2 sec → RED (Immediate)',
                        '',
                        '4. Check mental status:',
                        '   - Can\'t follow simple commands → RED (Immediate)',
                        '',
                        '5. If passed all checks → YELLOW (Delayed)',
                        '',
                        'CATEGORIES:',
                        '- RED/Immediate: Life-threatening but survivable',
                        '- YELLOW/Delayed: Serious but can wait',
                        '- GREEN/Minor: Walking wounded',
                        '- BLACK/Deceased: Dead or unsalvageable'
                    ],
                    notes: 'Triage is dynamic - recheck patients. Goal is greatest good for greatest number. In wilderness, may need to prioritize who gets evacuated first.',
                    equipment: ['Triage tags', 'Marker', 'Flagging tape']
                }
            ]
        },

        // =====================================================
        // PROCEDURES
        // =====================================================
        procedures: {
            name: 'Procedures',
            icon: '🩺',
            color: '#ec4899',
            items: [
                {
                    id: 'cpr',
                    title: 'CPR',
                    severity: 'critical',
                    keywords: ['cpr', 'cardiac arrest', 'compressions', 'rescue breathing', 'aed'],
                    summary: 'Cardiopulmonary resuscitation for cardiac arrest.',
                    protocol: [
                        'ADULT CPR:',
                        '1. Confirm unresponsive - tap shoulders, shout',
                        '2. Call for help, get AED if available',
                        '3. Check pulse (carotid) for max 10 seconds',
                        '4. If no pulse, begin compressions:',
                        '   - Center of chest, between nipples',
                        '   - Push hard (2+ inches) and fast (100-120/min)',
                        '   - Allow full chest recoil',
                        '   - 30 compressions, then 2 breaths',
                        '   - Continue 30:2 ratio',
                        '',
                        'COMPRESSION-ONLY CPR:',
                        '- If untrained or unwilling to give breaths',
                        '- Continuous compressions without stopping',
                        '',
                        'AED:',
                        '- Turn on, follow prompts',
                        '- Bare chest, attach pads',
                        '- Don\'t touch during analysis/shock',
                        '- Resume CPR immediately after shock',
                        '',
                        'Continue until: patient recovers, help arrives, or you\'re exhausted'
                    ],
                    notes: 'High-quality compressions are most important. Push hard. Minimize interruptions. Drowning/asphyxiation: start with 5 rescue breaths. Hypothermia: continue CPR longer.',
                    equipment: ['AED', 'CPR barrier mask', 'Firm surface']
                },
                {
                    id: 'choking',
                    title: 'Choking / Airway Obstruction',
                    severity: 'critical',
                    keywords: ['choking', 'obstruction', 'heimlich', 'airway'],
                    summary: 'Relief of foreign body airway obstruction.',
                    protocol: [
                        'CONSCIOUS ADULT - SEVERE OBSTRUCTION:',
                        '- Can\'t speak, cough, or breathe',
                        '- Abdominal thrusts (Heimlich):',
                        '  - Stand behind, arms around waist',
                        '  - Fist above navel, thumb side in',
                        '  - Quick upward thrusts',
                        '  - Repeat until object expelled or unconscious',
                        '',
                        'PREGNANT OR OBESE:',
                        '- Chest thrusts instead of abdominal',
                        '',
                        'UNCONSCIOUS:',
                        '- Lower to ground',
                        '- Begin CPR (30 compressions)',
                        '- Before breaths, look in mouth - remove visible object',
                        '- Continue CPR',
                        '',
                        'SELF:',
                        '- Use own fist for thrusts',
                        '- Or thrust against chair back/countertop',
                        '',
                        'INFANT (<1 year):',
                        '- 5 back slaps + 5 chest thrusts',
                        '- Support head, face down on forearm'
                    ],
                    notes: 'Mild obstruction (can cough/speak): encourage coughing, don\'t interfere. Blind finger sweeps not recommended.',
                    equipment: ['Training in technique']
                },
                {
                    id: 'splinting',
                    title: 'Splinting Techniques',
                    severity: 'info',
                    keywords: ['splint', 'immobilize', 'fracture', 'sam splint'],
                    summary: 'Proper splinting of suspected fractures.',
                    protocol: [
                        'PRINCIPLES:',
                        '- Immobilize joint above and below injury',
                        '- Splint in position found (unless no pulse)',
                        '- Pad all voids and bony prominences',
                        '- Check CMS before and after (Circulation, Motor, Sensation)',
                        '',
                        'ARM/WRIST:',
                        '- SAM splint or padded boards',
                        '- Forearm: elbow to fingers',
                        '- Sling and swathe for support',
                        '',
                        'LEG:',
                        '- Two splints (medial and lateral) or traction splint for femur',
                        '- Pad well, secure at multiple points',
                        '',
                        'ANKLE:',
                        '- Figure-8 wrap or pillow splint',
                        '- Can walk if needed with proper support',
                        '',
                        'IMPROVISED MATERIALS:',
                        '- Sleeping pads, sticks, trekking poles',
                        '- Tape, belts, strips of clothing',
                        '- Buddy splinting (injured finger to adjacent finger)'
                    ],
                    notes: 'Snug but not tight - should be able to slide finger under. Check circulation frequently. Ice helps swelling (20 min on/20 off).',
                    equipment: ['SAM splint', 'Padding', 'Triangular bandages', 'Elastic bandage', 'Tape']
                },
                {
                    id: 'wound-closure',
                    title: 'Wound Closure',
                    severity: 'info',
                    keywords: ['wound', 'suture', 'steri-strips', 'closure', 'laceration'],
                    summary: 'Field wound closure techniques.',
                    protocol: [
                        'WHEN TO CLOSE IN FIELD:',
                        '- Clean cut (not crush/bite)',
                        '- Less than 6-8 hours old',
                        '- No signs of infection',
                        '- Evacuation >24 hours away',
                        '',
                        'WHEN NOT TO CLOSE:',
                        '- Animal/human bites',
                        '- Puncture wounds',
                        '- Contaminated wounds',
                        '- Signs of infection',
                        '- Wounds over 12 hours old',
                        '',
                        'STERI-STRIPS/BUTTERFLY CLOSURE:',
                        '- Clean and dry wound edges',
                        '- Apply strips perpendicular to wound',
                        '- Don\'t pull too tight',
                        '- Apply every 3-4mm',
                        '- Benzoin tincture helps adhesion',
                        '',
                        'WOUND CARE IF NOT CLOSING:',
                        '- Irrigate thoroughly with clean water',
                        '- Pack loosely with moist gauze',
                        '- Cover with dry dressing',
                        '- Change daily'
                    ],
                    notes: 'Irrigation is more important than closure. Use at least 500ml of clean water under pressure (syringe or squeeze bottle).',
                    equipment: ['Steri-strips', 'Benzoin tincture', 'Irrigation syringe', 'Sterile gauze', 'Clean water']
                },
                {
                    id: 'recovery-position',
                    title: 'Recovery Position',
                    severity: 'info',
                    keywords: ['recovery position', 'unconscious', 'breathing', 'lateral recumbent'],
                    summary: 'Safe positioning for unconscious breathing patient.',
                    protocol: [
                        'INDICATION:',
                        '- Unconscious but breathing',
                        '- No suspected spinal injury',
                        '',
                        'PROCEDURE:',
                        '1. Kneel beside patient',
                        '2. Place near arm at right angle to body',
                        '3. Bring far arm across chest, hold hand against cheek',
                        '4. Bend far knee up',
                        '5. Roll patient toward you onto side',
                        '6. Adjust top leg for stability (hip and knee at 90°)',
                        '7. Tilt head back slightly to open airway',
                        '8. Position hand under cheek to maintain head position',
                        '',
                        'MONITORING:',
                        '- Check breathing frequently',
                        '- Switch sides every 30 minutes if prolonged',
                        '- Be ready to roll supine for CPR if needed'
                    ],
                    notes: 'Position allows fluids to drain from mouth, maintains open airway. Left side preferred for pregnant patients.',
                    equipment: ['Flat surface', 'Blanket/padding']
                }
            ]
        }
    };

    // State
    let bookmarks = [];
    let searchQuery = '';
    let activeCategory = null;
    let expandedItem = null;

    /**
     * Initialize the module
     */
    function init() {
        // Load bookmarks from storage
        loadBookmarks();
    }

    /**
     * Load bookmarks from storage
     */
    async function loadBookmarks() {
        try {
            const saved = await Storage.Settings.get('medical_bookmarks');
            if (saved) {
                bookmarks = saved;
            }
        } catch (e) {
            console.error('Failed to load medical bookmarks:', e);
        }
    }

    /**
     * Save bookmarks to storage
     */
    async function saveBookmarks() {
        try {
            await Storage.Settings.set('medical_bookmarks', bookmarks);
        } catch (e) {
            console.error('Failed to save medical bookmarks:', e);
        }
    }

    /**
     * Toggle bookmark for an item
     */
    function toggleBookmark(itemId) {
        const index = bookmarks.indexOf(itemId);
        if (index > -1) {
            bookmarks.splice(index, 1);
        } else {
            bookmarks.push(itemId);
        }
        saveBookmarks();
        return bookmarks.includes(itemId);
    }

    /**
     * Check if item is bookmarked
     */
    function isBookmarked(itemId) {
        return bookmarks.includes(itemId);
    }

    /**
     * Search the medical database
     */
    function search(query) {
        searchQuery = query.toLowerCase().trim();
        const results = [];

        if (!searchQuery) {
            return results;
        }

        Object.entries(MEDICAL_DATABASE).forEach(([catKey, category]) => {
            category.items.forEach(item => {
                const searchFields = [
                    item.title,
                    item.summary,
                    ...(item.keywords || []),
                    ...(item.protocol || [])
                ].join(' ').toLowerCase();

                if (searchFields.includes(searchQuery)) {
                    results.push({
                        ...item,
                        category: catKey,
                        categoryName: category.name,
                        categoryIcon: category.icon,
                        categoryColor: category.color
                    });
                }
            });
        });

        // Sort by relevance (title match first)
        results.sort((a, b) => {
            const aTitle = a.title.toLowerCase().includes(searchQuery);
            const bTitle = b.title.toLowerCase().includes(searchQuery);
            if (aTitle && !bTitle) return -1;
            if (!aTitle && bTitle) return 1;
            return 0;
        });

        return results;
    }

    /**
     * Get items for a category
     */
    function getCategoryItems(categoryKey) {
        const category = MEDICAL_DATABASE[categoryKey];
        if (!category) return [];
        
        return category.items.map(item => ({
            ...item,
            category: categoryKey,
            categoryName: category.name,
            categoryIcon: category.icon,
            categoryColor: category.color
        }));
    }

    /**
     * Get a single item by ID
     */
    function getItem(itemId) {
        for (const [catKey, category] of Object.entries(MEDICAL_DATABASE)) {
            const item = category.items.find(i => i.id === itemId);
            if (item) {
                return {
                    ...item,
                    category: catKey,
                    categoryName: category.name,
                    categoryIcon: category.icon,
                    categoryColor: category.color
                };
            }
        }
        return null;
    }

    /**
     * Get bookmarked items
     */
    function getBookmarkedItems() {
        return bookmarks.map(id => getItem(id)).filter(Boolean);
    }

    /**
     * Get severity color
     */
    function getSeverityColor(severity) {
        const colors = {
            critical: '#ef4444',
            high: '#f59e0b',
            moderate: '#3b82f6',
            low: '#22c55e',
            info: '#6b7280'
        };
        return colors[severity] || colors.info;
    }

    /**
     * Get severity label
     */
    function getSeverityLabel(severity) {
        const labels = {
            critical: 'CRITICAL',
            high: 'HIGH PRIORITY',
            moderate: 'MODERATE',
            low: 'LOW PRIORITY',
            info: 'REFERENCE'
        };
        return labels[severity] || 'INFO';
    }

    /**
     * Get state for UI
     */
    function getState() {
        return {
            searchQuery,
            activeCategory,
            expandedItem,
            bookmarkCount: bookmarks.length
        };
    }

    /**
     * Set active category
     */
    function setActiveCategory(category) {
        activeCategory = category;
        expandedItem = null;
    }

    /**
     * Set expanded item
     */
    function setExpandedItem(itemId) {
        expandedItem = itemId;
    }

    /**
     * Get database for export/printing
     */
    function getDatabase() {
        return MEDICAL_DATABASE;
    }

    /**
     * Get protocol categories (excludes medications)
     * Returns object format for compatibility
     */
    function getCategories() {
        const cats = {};
        Object.entries(MEDICAL_DATABASE).forEach(([key, cat]) => {
            if (key !== 'medications') {
                cats[key] = {
                    name: cat.name,
                    icon: cat.icon,
                    color: cat.color,
                    itemCount: cat.items.length
                };
            }
        });
        return cats;
    }

    /**
     * Get medication categories for separate display
     */
    function getMedCategories() {
        return {
            pain: { name: 'Pain Relief', icon: '💊' },
            allergy: { name: 'Allergy', icon: '🤧' },
            gi: { name: 'GI/Stomach', icon: '🫃' },
            antibiotic: { name: 'Antibiotics', icon: '💉' },
            altitude: { name: 'Altitude', icon: '🏔️' },
            other: { name: 'Other', icon: '📋' }
        };
    }

    /**
     * Get protocols for a specific category
     */
    function getProtocolsByCategory(categoryKey) {
        const cat = MEDICAL_DATABASE[categoryKey];
        if (!cat) return [];
        return cat.items.map(item => transformProtocol(item, categoryKey));
    }

    /**
     * Get a single protocol by ID
     */
    function getProtocol(protocolId) {
        for (const [catKey, category] of Object.entries(MEDICAL_DATABASE)) {
            const item = category.items.find(i => i.id === protocolId);
            if (item) {
                return transformProtocol(item, catKey);
            }
        }
        return null;
    }

    /**
     * Transform internal protocol structure to UI-expected format
     */
    function transformProtocol(item, categoryKey) {
        // Convert protocol array to steps format
        const steps = [];
        let currentStep = { title: 'Procedure', content: '', warning: '' };
        
        if (item.protocol && Array.isArray(item.protocol)) {
            item.protocol.forEach(line => {
                if (line === '') {
                    if (currentStep.content) {
                        steps.push({ ...currentStep });
                        currentStep = { title: 'Continue', content: '', warning: '' };
                    }
                } else if (line.endsWith(':') && !line.includes(' ')) {
                    // This is a section header
                    if (currentStep.content) {
                        steps.push({ ...currentStep });
                    }
                    currentStep = { title: line.slice(0, -1), content: '', warning: '' };
                } else if (line.startsWith('WARNING:') || line.startsWith('CAUTION:')) {
                    currentStep.warning = line.substring(line.indexOf(':') + 1).trim();
                } else {
                    currentStep.content += (currentStep.content ? '\n' : '') + line;
                }
            });
            if (currentStep.content) {
                steps.push(currentStep);
            }
        }

        // If we didn't parse any steps, create one big step
        if (steps.length === 0 && item.protocol) {
            steps.push({
                title: 'Protocol',
                content: Array.isArray(item.protocol) ? item.protocol.join('\n') : item.protocol,
                warning: ''
            });
        }

        return {
            id: item.id,
            title: item.title,
            severity: item.severity || 'info',
            tags: item.keywords || [],
            overview: item.summary || '',
            steps: steps,
            equipment: item.equipment || [],
            medications: [], // Could be enhanced later
            notes: item.notes || '',
            category: categoryKey,
            categoryName: MEDICAL_DATABASE[categoryKey]?.name || ''
        };
    }

    /**
     * Get all medications as a keyed object
     */
    function getAllMedications() {
        const meds = {};
        const medCategory = MEDICAL_DATABASE.medications;
        if (medCategory && medCategory.items) {
            medCategory.items.forEach(item => {
                meds[item.id] = transformMedication(item);
            });
        }
        return meds;
    }

    /**
     * Get a single medication by ID
     */
    function getMedication(medId) {
        const meds = MEDICAL_DATABASE.medications;
        if (!meds) return null;
        const item = meds.items.find(i => i.id === medId);
        if (item) {
            return transformMedication(item);
        }
        return null;
    }

    /**
     * Get medications by category
     */
    function getMedicationsByCategory(catKey) {
        const allMeds = getAllMedications();
        return Object.values(allMeds).filter(m => m.category === catKey);
    }

    /**
     * Transform medication data to expected format
     */
    function transformMedication(item) {
        // Determine category based on title/keywords
        let category = 'other';
        const lowerTitle = item.title.toLowerCase();
        if (lowerTitle.includes('pain') || lowerTitle.includes('ibuprofen') || lowerTitle.includes('acetaminophen')) {
            category = 'pain';
        } else if (lowerTitle.includes('allergy') || lowerTitle.includes('antihistamine')) {
            category = 'allergy';
        } else if (lowerTitle.includes('gi') || lowerTitle.includes('stomach') || lowerTitle.includes('diarrhea')) {
            category = 'gi';
        } else if (lowerTitle.includes('antibiotic')) {
            category = 'antibiotic';
        } else if (lowerTitle.includes('altitude')) {
            category = 'altitude';
        }

        // Extract uses from protocol
        const uses = [];
        if (item.keywords) {
            uses.push(...item.keywords.slice(0, 3));
        }

        // Parse dosing from protocol
        const dosing = {};
        const warnings = [];
        const interactions = [];

        if (item.protocol && Array.isArray(item.protocol)) {
            item.protocol.forEach(line => {
                if (line.toLowerCase().includes('dose:') || line.toLowerCase().includes('- dose:')) {
                    const match = line.match(/dose:?\s*(.+)/i);
                    if (match) {
                        dosing.standard = match[1].trim();
                    }
                }
                if (line.toLowerCase().includes('caution:') || line.toLowerCase().includes('warning')) {
                    warnings.push(line);
                }
                if (line.includes('+') && line.includes('=')) {
                    interactions.push(line);
                }
            });
        }

        return {
            id: item.id,
            name: item.title,
            category: category,
            uses: uses.length > 0 ? uses : [item.summary?.split('.')[0] || 'General use'],
            dosing: Object.keys(dosing).length > 0 ? dosing : { standard: 'See protocol' },
            warnings: warnings.length > 0 ? warnings : [],
            interactions: interactions,
            notes: item.notes || '',
            protocol: item.protocol || []
        };
    }

    /**
     * Expose MEDICATIONS for panels.js compatibility
     */
    const MEDICATIONS = (() => {
        const meds = {};
        const medCategory = MEDICAL_DATABASE.medications;
        if (medCategory && medCategory.items) {
            medCategory.items.forEach(item => {
                meds[item.id] = transformMedication(item);
            });
        }
        return meds;
    })();

    /**
     * Get quick reference tables for essential medical data
     */
    function getQuickReferences() {
        return {
            vitalSigns: {
                title: '📊 Normal Vital Signs (Adults)',
                content: [
                    { label: 'Heart Rate', value: '60-100 bpm' },
                    { label: 'Respiratory Rate', value: '12-20 breaths/min' },
                    { label: 'Blood Pressure', value: '90-140 / 60-90 mmHg' },
                    { label: 'Temperature', value: '97.8-99.1°F (36.5-37.3°C)' },
                    { label: 'SpO2', value: '95-100%' },
                    { label: 'Blood Glucose', value: '70-120 mg/dL' }
                ]
            },
            cpr: {
                title: '❤️ CPR Guidelines',
                content: [
                    { label: 'Compression Rate', value: '100-120/min' },
                    { label: 'Compression Depth', value: '2-2.4 inches (5-6 cm)' },
                    { label: 'Ratio (1 rescuer)', value: '30:2' },
                    { label: 'Ratio (2 rescuer)', value: '30:2 (15:2 child)' },
                    { label: 'AED Check', value: 'Every 2 minutes' },
                    { label: 'Pulse Check', value: 'Max 10 seconds' }
                ]
            },
            burns: {
                title: '🔥 Rule of 9s (Burn Area)',
                content: [
                    { label: 'Head & Neck', value: '9%' },
                    { label: 'Each Arm', value: '9%' },
                    { label: 'Chest (front)', value: '9%' },
                    { label: 'Abdomen (front)', value: '9%' },
                    { label: 'Upper Back', value: '9%' },
                    { label: 'Lower Back', value: '9%' },
                    { label: 'Each Leg (front)', value: '9%' },
                    { label: 'Each Leg (back)', value: '9%' },
                    { label: 'Groin', value: '1%' },
                    { label: 'Palm of Hand', value: '~1%' }
                ]
            },
            gcs: {
                title: '🧠 Glasgow Coma Scale',
                content: [
                    { label: 'Eye - Spontaneous', value: '4' },
                    { label: 'Eye - To voice', value: '3' },
                    { label: 'Eye - To pain', value: '2' },
                    { label: 'Eye - None', value: '1' },
                    { label: 'Verbal - Oriented', value: '5' },
                    { label: 'Verbal - Confused', value: '4' },
                    { label: 'Verbal - Inappropriate', value: '3' },
                    { label: 'Verbal - Incomprehensible', value: '2' },
                    { label: 'Verbal - None', value: '1' },
                    { label: 'Motor - Obeys commands', value: '6' },
                    { label: 'Motor - Localizes pain', value: '5' },
                    { label: 'Motor - Withdraws', value: '4' },
                    { label: 'Motor - Flexion', value: '3' },
                    { label: 'Motor - Extension', value: '2' },
                    { label: 'Motor - None', value: '1' },
                    { label: 'TOTAL (Normal)', value: '15' },
                    { label: 'Severe TBI', value: '≤8' }
                ]
            },
            bloodLoss: {
                title: '🩸 Hemorrhage Classification',
                content: [
                    { label: 'Class I - Blood Loss', value: '<750 mL (<15%)' },
                    { label: 'Class I - Heart Rate', value: '<100' },
                    { label: 'Class II - Blood Loss', value: '750-1500 mL (15-30%)' },
                    { label: 'Class II - Heart Rate', value: '100-120' },
                    { label: 'Class III - Blood Loss', value: '1500-2000 mL (30-40%)' },
                    { label: 'Class III - Heart Rate', value: '120-140' },
                    { label: 'Class IV - Blood Loss', value: '>2000 mL (>40%)' },
                    { label: 'Class IV - Heart Rate', value: '>140' }
                ]
            },
            painMeds: {
                title: '💊 Pain Medication Quick Dosing',
                content: [
                    { label: 'Acetaminophen (Tylenol)', value: '325-650mg q4-6h (max 3g/day)' },
                    { label: 'Ibuprofen (Advil)', value: '200-400mg q4-6h (max 1.2g/day)' },
                    { label: 'Naproxen (Aleve)', value: '220-440mg q8-12h (max 660mg/day)' },
                    { label: 'Aspirin', value: '325-650mg q4h (max 4g/day)' }
                ]
            },
            allergyMeds: {
                title: '🤧 Allergy Medication Dosing',
                content: [
                    { label: 'Diphenhydramine (Benadryl)', value: '25-50mg q4-6h (max 300mg/day)' },
                    { label: 'Cetirizine (Zyrtec)', value: '10mg once daily' },
                    { label: 'Loratadine (Claritin)', value: '10mg once daily' },
                    { label: 'Epinephrine (EpiPen)', value: '0.3mg IM, may repeat x1' }
                ]
            },
            hypothermia: {
                title: '🥶 Hypothermia Stages',
                content: [
                    { label: 'Mild (90-95°F)', value: 'Shivering, alert, clumsy' },
                    { label: 'Moderate (82-90°F)', value: 'Shivering stops, confused' },
                    { label: 'Severe (<82°F)', value: 'Unconscious, rigid' },
                    { label: 'Treatment', value: 'Remove wet, insulate, warm core' }
                ]
            },
            altitude: {
                title: '🏔️ Altitude Illness',
                content: [
                    { label: 'AMS begins', value: '>8,000 ft (2,400m)' },
                    { label: 'High altitude', value: '8,000-12,000 ft' },
                    { label: 'Very high altitude', value: '12,000-18,000 ft' },
                    { label: 'Extreme altitude', value: '>18,000 ft' },
                    { label: 'Safe ascent rate', value: '<1,000 ft/day above 10,000' },
                    { label: 'Diamox prophylaxis', value: '125-250mg BID' }
                ]
            }
        };
    }

    // Public API
    return {
        init,
        search,
        getCategories,
        getMedCategories,
        getCategoryItems,
        getItem,
        getProtocol,
        getProtocolsByCategory,
        getMedication,
        getAllMedications,
        getMedicationsByCategory,
        getBookmarkedItems,
        toggleBookmark,
        isBookmarked,
        getSeverityColor,
        getSeverityLabel,
        getState,
        setActiveCategory,
        setExpandedItem,
        getDatabase,
        getQuickReferences,
        MEDICAL_DATABASE,
        MEDICATIONS
    };
})();

window.MedicalModule = MedicalModule;
