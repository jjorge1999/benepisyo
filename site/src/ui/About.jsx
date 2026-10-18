import React from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Flex from 'antd/es/flex';
import Typography from 'antd/es/typography';
import { useApp } from './shared.js';

const { Title, Paragraph, Text } = Typography;
const C = {
  intro: { tl: 'Ang Benepisyo ay libreng gabay para malaman ng bawat Pilipino ang lahat ng benepisyong puwede niyang makuha sa sariling lungsod: pambansa at lokal, may eksaktong halaga, dadalhin at opisina.', en: 'Benepisyo is a free guide that helps every Filipino find every benefit they can get in their own city: national and local, with exact amounts, what to bring and which office to visit.' },
  notgov: { tl: 'Hindi ito opisyal na website ng gobyerno.', en: 'This is not an official government website.' },
  notgov2: { tl: 'Ang opisina na nagbibigay ng benepisyo ang magpapasya kung kwalipikado kayo. Kumpirmahin muna bago pumunta.', en: 'The issuing office decides eligibility. Confirm before you go.' },
  acc: { tl: 'Paano namin sinisigurong tama', en: 'How we keep it accurate' },
  acc1: { tl: 'Kumpirmado: may opisyal na source (batas, ordinansa, website o post ng lungsod) at na-check sa loob ng 6 na buwan.', en: 'Confirmed: backed by an official source (law, ordinance, city website or post) and checked within 6 months.' },
  acc2: { tl: 'Ulat: galing sa balita, paaralan o user; hindi pa kumpirmado ng opisyal na source.', en: 'Reported: from news, a school or a user; not yet confirmed by an official source.' },
  acc3: { tl: 'Baka nagbago na: hindi pa nare-recheck nang higit 6 na buwan.', en: 'May have changed: not rechecked in over 6 months.' },
  priv: { tl: 'Walang account. Ang inyong mga sagot at listahan ng pamilya ay naka-save lang sa phone ninyo. Kung gagamitin ang lokasyon, sa phone lang ito tinitingnan para hulaan ang lungsod; hindi ito ipinapadala o sine-save. Hindi kami humihingi ng ID number, eksaktong kita o birthday. Ang contact sa report ay opsyonal at binubura pagkalipas ng 90 araw (RA 10173, Data Privacy Act).', en: 'No accounts. Your answers and family list are saved on your phone only. If you use your location, it is only checked on your phone to guess your city; it is never sent or saved. We never ask for ID numbers, exact income or birthdays. Contact details on reports are optional and deleted after 90 days (RA 10173, Data Privacy Act).' },
  free: { tl: 'Walang bayad, walang fixer', en: 'Free, no fixers' },
  free2: { tl: 'Libre ang mga benepisyong nakalista dito. Huwag magbayad sa sinumang nag-aalok na "ilakad" ito.', en: 'The benefits listed here are free. Don\'t pay anyone offering to "process" them for you.' },
  covered: { tl: 'Ang lungsod na saklaw ngayon: Calamba, Laguna.', en: 'City covered now: Calamba, Laguna.' }
};

export default function About() {
  const { t, L, data } = useApp();
  return (
    <Flex vertical gap={16}>
      <Title level={1}>{t('about_title')}</Title>
      <Paragraph>{L(C.intro)}</Paragraph>
      <Alert type="warning" showIcon message={<b>{L(C.notgov)}</b>} description={L(C.notgov2)} />
      <Card title={L(C.acc)}><ul><li>{L(C.acc1)}</li><li>{L(C.acc2)}</li><li>{L(C.acc3)}</li></ul></Card>
      <Card title="Privacy"><Paragraph style={{ margin: 0 }}>{L(C.priv)}</Paragraph></Card>
      <Card title={L(C.free)}><Paragraph style={{ margin: 0 }}>{L(C.free2)}</Paragraph></Card>
      <Text type="secondary">Data {data.meta.data_version} · {L(C.covered)}</Text>
    </Flex>
  );
}

export function NotFound() {
  const { t, cfg } = useApp();
  return (
    <Flex vertical gap={16} style={{ paddingBlock: 40 }}>
      <Title level={1}>{t('not_found')}</Title>
      <Button type="primary" href={cfg.base}>Benepisyo</Button>
    </Flex>
  );
}
