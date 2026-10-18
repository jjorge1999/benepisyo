import React, { useEffect, useRef, useState } from 'react';
import Alert from 'antd/es/alert';
import AutoComplete from 'antd/es/auto-complete';
import Badge from 'antd/es/badge';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Empty from 'antd/es/empty';
import Flex from 'antd/es/flex';
import Input from 'antd/es/input';
import Popconfirm from 'antd/es/popconfirm';
import Progress from 'antd/es/progress';
import Space from 'antd/es/space';
import Spin from 'antd/es/spin';
import Typography from 'antd/es/typography';
import AimOutlined from '@ant-design/icons/es/icons/AimOutlined';
import ArrowLeftOutlined from '@ant-design/icons/es/icons/ArrowLeftOutlined';
import ArrowRightOutlined from '@ant-design/icons/es/icons/ArrowRightOutlined';
import EditOutlined from '@ant-design/icons/es/icons/EditOutlined';
import PlusOutlined from '@ant-design/icons/es/icons/PlusOutlined';
import TeamOutlined from '@ant-design/icons/es/icons/TeamOutlined';
import UnlockOutlined from '@ant-design/icons/es/icons/UnlockOutlined';
import UserOutlined from '@ant-design/icons/es/icons/UserOutlined';
import { BenefitCard, Checkin, Choice } from './Common.jsx';
import { locate, locationAllowed, nearestLgu } from './geo.js';
import { M, MAX_PEOPLE, activePerson, manilaToday, people, savePeople, send, store, uid, useApp, useFullData } from './shared.js';

const { Title, Text, Paragraph } = Typography;

function Steps4({ step }) {
  return <Progress percent={((step + 1) / 4) * 100} steps={4} showInfo={false} size={[56, 6]} aria-hidden="true" />;
}

function normCity(v) { return v.toLowerCase().replace(/\s*city$/, '').replace(/^city of\s*/, '').trim(); }

function CityStep({ d, setD, onNext, hasPeople, toFamily }) {
  const { t, data, cfg } = useApp();
  const { msg: message } = useApp();
  const [geo, setGeo] = useState({ state: 'idle' }); // idle | finding | found | far | denied | unavailable
  const lgus = data.meta.laguna_lgus;
  const coords = data.meta.lgu_coords || {};
  const v = (d.cityLabel || '').trim();
  const hit = data.meta.cities.find((c) => c.supported && c.name.toLowerCase() === normCity(v));

  const findMe = (silent) => {
    setGeo({ state: 'finding' });
    return locate().then(({ lat, lng }) => {
      const near = nearestLgu(lat, lng, coords);
      if (!near) { setGeo({ state: 'far' }); return; }
      setD((x) => ({ ...x, cityLabel: near.name }));
      setGeo({ state: 'found', name: near.name });
    }).catch((e) => setGeo({ state: silent ? 'idle' : e.message }));
  };
  // Prefill without a prompt when location was already allowed, and the field is still empty.
  useEffect(() => {
    if (d.cityLabel || d.cityTouched) return;
    locationAllowed().then((ok) => { if (ok) findMe(true); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = lgus.filter((c) => !v || c.toLowerCase().includes(v.toLowerCase())).map((c) => ({ value: c }));
  return (
    <Card className="panel">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Steps4 step={0} />
        <label className="q-title" htmlFor="city-input">{t('step_city')}</label>
        <Text type="secondary">{t('step_city_hint')}</Text>
        <AutoComplete
          id="city-input"
          size="large"
          style={{ width: '100%' }}
          options={options}
          value={d.cityLabel}
          placeholder={t('city_placeholder')}
          onChange={(val) => setD((x) => ({ ...x, cityLabel: val, cityTouched: true }))}
          allowClear
        />
        <Button id="geo-btn" icon={<AimOutlined />} loading={geo.state === 'finding'} onClick={() => findMe(false)}>
          {geo.state === 'finding' ? t('geo_finding') : t('geo_btn')}
        </Button>
        {geo.state === 'found' && <Text type="secondary" id="geo-note">{t('geo_found', { city: geo.name })}</Text>}
        {geo.state === 'far' && <Alert type="info" showIcon message={t('geo_far')} />}
        {(geo.state === 'denied' || geo.state === 'unavailable') && <Alert type="info" showIcon message={t('geo_' + geo.state)} />}
        <div id="city-note">
          {v && hit && <Alert type="success" showIcon message={t('city_supported')} />}
          {v && !hit && (
            <Alert
              type="warning"
              showIcon
              message={t('city_unsupported', { city: v })}
              action={<Button size="small" type="link" id="req-city" onClick={() => {
                const reqs = store.get('cityRequests', []); reqs.push({ city: v, at: manilaToday() }); store.set('cityRequests', reqs);
                send(cfg.api, '/api/city-requests', { city: v });
                message.success(t('city_requested', { city: v }));
              }}>{t('city_request')}</Button>}
            />
          )}
        </div>
        <Flex justify="space-between" gap={8}>
          {hasPeople ? <Button type="text" id="to-family" icon={<TeamOutlined />} onClick={toFamily}>{t('nav_family')}</Button> : <span />}
          <Button type="primary" size="large" id="city-next" icon={<ArrowRightOutlined />} iconPosition="end" onClick={() => {
            if (!v) { document.getElementById('city-input')?.focus(); return; }
            onNext({ city: hit ? hit.id : null, cityLabel: v });
          }}>{t('next')}</Button>
        </Flex>
      </Space>
    </Card>
  );
}

function WhoStep({ d, setD, onNext, onBack }) {
  const { t, L, lang, data } = useApp();
  const [err, setErr] = useState(false);
  const toggle = (g) => { setErr(false); setD((x) => ({ ...x, groups: x.groups.includes(g) ? x.groups.filter((y) => y !== g) : x.groups.concat(g) })); };
  return (
    <Card className="panel">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Steps4 step={1} />
        <Title level={3} className="q-title">{t('step_who')}</Title>
        <Flex gap={8} role="radiogroup">
          <Choice on={d.self} data-self="1" icon={<UserOutlined />} onClick={() => setD((x) => ({ ...x, self: true }))}>{t('who_self')}</Choice>
          <Choice on={!d.self} data-self="0" icon={<TeamOutlined />} onClick={() => setD((x) => ({ ...x, self: false }))}>{t('who_family')}</Choice>
        </Flex>
        {!d.self && (
          <div className="field">
            <label htmlFor="who-name">{t('who_name')}</label>
            <Input id="who-name" size="large" maxLength={30} placeholder={t('who_name_ph')} value={d.name} onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} />
          </div>
        )}
        <Text strong>{t('who_groups')}</Text>
        <Flex vertical gap={8}>
          {data.meta.groups.map((g) => (
            <Choice key={g.id} multi on={d.groups.includes(g.id)} data-group={g.id} hint={L(g.hint)} onClick={() => toggle(g.id)}>{g[lang]}</Choice>
          ))}
        </Flex>
        {err && <Alert id="who-err" type="error" showIcon message={t('need_group')} />}
        <Flex justify="space-between">
          <Button type="text" id="who-back" icon={<ArrowLeftOutlined />} onClick={onBack}>{t('back')}</Button>
          <Button type="primary" size="large" id="who-next" icon={<ArrowRightOutlined />} iconPosition="end" onClick={() => {
            if (!d.groups.length) { setErr(true); return; }
            onNext();
          }}>{t('next')}</Button>
        </Flex>
      </Space>
    </Card>
  );
}

function QuestionStep({ d, setD, qi, setQi, onBack, onDone }) {
  const { t, lang, data, cityName, subj, subjposs } = useApp();
  const qs = M.questionsFor(d, d.city);
  const q = qs[qi];
  const first = useRef(null);
  useEffect(() => { first.current && first.current.focus({ preventScroll: true }); }, [qi]);
  if (!q) return null;
  const c = d.city ? cityName(d.city) : d.cityLabel;
  const title = q === 'age_band' ? (d.self ? t('q_age_band_self') : t('q_age_band', { subj: subj(d) }))
    : d.self ? t('q_' + q + '_self', { city: c }) : t('q_' + q, { subj: subj(d), subjposs: subjposs(d), city: c });
  const next = () => { setQi(qi + 1); window.scrollTo(0, 0); };
  const back = () => (qi === 0 ? onBack() : setQi(qi - 1));

  if (q === 'docs') {
    const docs = data.meta.docs.filter((x) => !x.groups || x.groups.some((g) => d.groups.includes(g)));
    const toggle = (id) => setD((x) => ({ ...x, noDocs: false, docs: x.docs.includes(id) ? x.docs.filter((y) => y !== id) : x.docs.concat(id) }));
    return (
      <Card className="panel">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Steps4 step={2} />
          <Title level={3} className="q-title" id="q-title">{title}</Title>
          <Text type="secondary">{t('q_docs_hint')}</Text>
          <Flex vertical gap={8} aria-labelledby="q-title">
            {docs.map((x, i) => <Choice key={x.id} ref={i === 0 ? first : undefined} multi on={d.docs.includes(x.id)} data-doc={x.id} onClick={() => toggle(x.id)}>{x[lang]}</Choice>)}
            <Choice multi on={!!d.noDocs} data-doc="__none" onClick={() => setD((x) => ({ ...x, docs: [], noDocs: true }))}>{t('none_yet')}</Choice>
          </Flex>
          <Flex justify="space-between">
            <Button type="text" id="q-back" icon={<ArrowLeftOutlined />} onClick={back}>{t('back')}</Button>
            <Button type="primary" size="large" id="q-done" onClick={onDone}>{t('see_results')}</Button>
          </Flex>
        </Space>
      </Card>
    );
  }
  const opts = q === 'age_band' ? [['60_79', t('age_60_79')], ['80_99', t('age_80_99')], ['100plus', t('age_100plus')]]
    : q === 'income' ? [['low', t('income_low')], ['mid', t('income_mid')], ['high', t('income_high')], ['skip', t('income_skip')]]
      : [[true, t('yes')], [false, t('no')], [null, t('not_sure')]];
  return (
    <Card className="panel">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Steps4 step={2} />
        <Title level={3} className="q-title" id="q-title">{title}</Title>
        <Flex vertical gap={8} role="radiogroup" aria-labelledby="q-title">
          {opts.map(([val, label], i) => (
            <Choice key={String(val)} ref={i === 0 ? first : undefined} on={q in d.answers && d.answers[q] === val} onClick={() => {
              setD((x) => {
                const answers = { ...x.answers, [q]: val };
                if (q === 'age_band' && val !== '80_99' && val !== '100plus') delete answers.milestone;
                return { ...x, answers };
              });
              next();
            }}>{label}</Choice>
          ))}
        </Flex>
        <Flex justify="space-between">
          <Button type="text" id="q-back" icon={<ArrowLeftOutlined />} onClick={back}>{t('back')}</Button>
          <Button type="link" id="q-skip" onClick={() => { setD((x) => { const answers = { ...x.answers }; delete answers[q]; return { ...x, answers }; }); next(); }}>{t('skip')}</Button>
        </Flex>
      </Space>
    </Card>
  );
}

export function Results({ p, full, today }) {
  const { t, docName, benefitUrl } = useApp();
  const r = M.buildResults(full.benefits, p, today);
  const label = p.self ? t('results_for_self') : t('results_for', { name: p.name || t('subj_other_plain') });
  const countKey = p.self ? 'results_count_self' : p.name ? 'results_count_other' : 'results_count_plain';
  const blockedN = r.blocked.reduce((n, g) => n + g.items.length, 0);
  return (
    <Flex vertical gap={16} className="results">
      <div className="result-head">
        <Title level={2} style={{ marginBottom: 4 }}>{label}</Title>
        <Text type="secondary">{t(countKey, { n: r.total, name: p.name })}{p.city ? '' : ' · ' + t('tag_national')}</Text>
      </div>
      <Divider orientation="left" className="section-label">{t('ready_title')} <Badge count={r.ready.length} showZero color="green" /></Divider>
      <Text type="secondary">{t('ready_sub')}</Text>
      {r.ready.length ? <Flex vertical gap={10}>{r.ready.map((x) => <BenefitCard key={x.benefit.id} b={x.benefit} res={x.result} today={today} />)}</Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      {r.blocked.length > 0 && <Divider orientation="left" className="section-label">{t('blocked_title')} <Badge count={blockedN} color="gold" /></Divider>}
      {r.blocked.map((g) => {
        const dn = g.docs.map(docName).join(' / ');
        return (
          <Card key={g.key} className="unlock" size="small">
            <Flex vertical gap={10}>
              <Text strong className="lead"><UnlockOutlined /> {g.items.length === 1 ? t('blocked_get_one', { doc: dn }) : t('blocked_get', { doc: dn, n: g.items.length })}</Text>
              {g.unlocker && <Button className="wrap-btn" type="primary" ghost href={benefitUrl(g.unlocker)}>{t('blocked_how', { doc: dn })}</Button>}
              {g.items.map((x) => <BenefitCard key={x.benefit.id} b={x.benefit} res={x.result} today={today} />)}
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}

function Family({ full, today, onOpen, onEdit, onAdd, onCleared, list, setList }) {
  const { t, cityName, link, benefitUrl, L } = useApp();
  const { msg: message } = useApp();
  const lastSeen = store.get('lastSeen', null);
  const ids = [];
  const summaries = list.map((p) => {
    const r = M.buildResults(full.benefits, p, today);
    r.ready.forEach((x) => ids.push(x.benefit.id));
    r.blocked.forEach((g) => g.items.forEach((x) => ids.push(x.benefit.id)));
    return { p, ready: r.ready.length, blocked: r.blocked.reduce((n, g) => n + g.items.length, 0) };
  });
  const [newsGone, setNewsGone] = useState(() => store.get('newsDismissed_' + full.version, false));
  const changed = M.changedSince(full.benefits, ids, lastSeen);
  return (
    <Flex vertical gap={16}>
      <Checkin fullData={full} today={today} />
      {changed.length > 0 && !newsGone && (
        <Alert id="news" type="info" showIcon closable onClose={() => { store.set('newsDismissed_' + full.version, true); store.set('lastSeen', today); setNewsGone(true); }}
          message={<b>{t('whats_new')}</b>}
          description={<ul>{changed.map((b) => <li key={b.id}><a href={benefitUrl(b)}>{t('whats_new_item', { title: L(b.title) })}</a></li>)}</ul>} />
      )}
      <div className="result-head">
        <Title level={2} style={{ marginBottom: 4 }}>{t('family_title')}</Title>
        <Text type="secondary">{t('family_sub')}</Text>
      </div>
      <Flex vertical gap={10} className="family">
        {summaries.map(({ p, ready, blocked }) => (
          <Card key={p.id} size="small" className="person"
            actions={[
              <Button key="o" type="link" data-open={p.id} onClick={() => onOpen(p.id)}>{t('open')}</Button>,
              <Button key="e" type="text" icon={<EditOutlined />} data-edit={p.id} onClick={() => onEdit(p)}>{t('edit')}</Button>,
              <Button key="r" type="text" danger data-remove={p.id} onClick={() => { const next = list.filter((x) => x.id !== p.id); savePeople(next); setList(next); }}>{t('remove')}</Button>
            ]}>
            <Card.Meta
              avatar={p.self ? <UserOutlined /> : <TeamOutlined />}
              title={p.self ? t('results_for_self') : p.name || t('who_family')}
              description={<>
                <div>{(p.city ? cityName(p.city) : p.cityLabel) + ' · ' + p.groups.map((g) => t('group_' + g)).join(', ')}</div>
                <Text>{t('family_counts', { ready, blocked })}</Text>
              </>} />
          </Card>
        ))}
      </Flex>
      <Flex gap={8} wrap>
        {list.length < MAX_PEOPLE && <Button type="primary" id="add-member" icon={<PlusOutlined />} onClick={onAdd}>{t('add_member_btn')}</Button>}
        <Button href={link('calamba/')}>{t('nav_city')}</Button>
      </Flex>
      <Popconfirm title={t('clear_confirm')} okText={t('clear_yes')} cancelText={t('cancel')} okButtonProps={{ danger: true, id: 'clear-yes' }}
        onConfirm={() => { ['people', 'active', 'visits', 'lastSeen', 'checks'].forEach(store.del); message.success(t('cleared')); onCleared(); }}>
        <Button type="link" danger id="clear-all" style={{ alignSelf: 'flex-start' }}>{t('clear_all')}</Button>
      </Popconfirm>
    </Flex>
  );
}

export default function Home() {
  const { t, cfg } = useApp();
  const full = useFullData(cfg.root);
  const [today] = useState(manilaToday);
  const newDraft = (extra) => ({ id: uid(), self: true, name: '', city: 'calamba', cityLabel: '', groups: [], answers: {}, docs: [], created: today, ...extra });
  const [list, setList] = useState([]);
  const [view, setView] = useState({ name: 'city', history: [] });
  const [d, setD] = useState(() => newDraft());
  const [qi, setQi] = useState(0);
  useEffect(() => {
    const ps = people(); setList(ps);
    if (ps.length) setView({ name: 'family', history: [] });
  }, []);
  const go = (name, extra) => { setView((v) => ({ ...v, ...extra, name, history: v.history.concat(v.name) })); window.scrollTo(0, 0); };
  const back = () => setView((v) => ({ ...v, name: v.history[v.history.length - 1] || 'city', history: v.history.slice(0, -1) }));
  const finish = () => {
    const next = list.filter((p) => p.id !== d.id).concat(d);
    savePeople(next); setList(next);
    store.set('active', d.id);
    if (!store.get('lastSeen', null)) store.set('lastSeen', today);
    setView({ name: 'results', history: ['family'], personId: d.id });
    window.scrollTo(0, 0);
  };
  const needsData = view.name === 'results' || view.name === 'family';

  let body;
  if (needsData && !full) body = <Flex justify="center" style={{ padding: 48 }}><Spin size="large" /></Flex>;
  else if (view.name === 'city') body = <CityStep d={d} setD={setD} hasPeople={list.length > 0} toFamily={() => setView({ name: 'family', history: [] })} onNext={(c) => { setD((x) => ({ ...x, ...c })); go('who'); }} />;
  else if (view.name === 'who') body = <WhoStep d={d} setD={setD} onBack={back} onNext={() => { setD((x) => ({ ...x, name: x.self ? '' : (x.name || '').trim().slice(0, 30) })); setQi(0); go('q'); }} />;
  else if (view.name === 'q') {
    body = <QuestionStep d={d} setD={setD} qi={qi} setQi={setQi} onBack={back} onDone={finish} />;
  } else if (view.name === 'results') {
    const p = list.find((x) => x.id === view.personId) || activePerson();
    body = p ? (
      <Flex vertical gap={16}>
        <Results p={p} full={full} today={today} />
        <Card className="panel">
          <Space direction="vertical">
            <Text strong>{t('add_member')}</Text>
            <Flex gap={8} wrap>
              {list.length < MAX_PEOPLE && <Button type="primary" id="add-member" icon={<PlusOutlined />} onClick={() => { setD(newDraft({ self: false, city: p.city, cityLabel: p.cityLabel })); setView({ name: 'who', history: ['results'], personId: p.id }); window.scrollTo(0, 0); }}>{t('add_member_btn')}</Button>}
              <Button id="to-family" icon={<TeamOutlined />} onClick={() => { setView({ name: 'family', history: [] }); window.scrollTo(0, 0); }}>{t('nav_family')}</Button>
            </Flex>
          </Space>
        </Card>
      </Flex>
    ) : null;
  } else {
    body = <Family full={full} today={today} list={list} setList={setList}
      onOpen={(id) => { store.set('active', id); setView({ name: 'results', history: ['family'], personId: id }); window.scrollTo(0, 0); }}
      onEdit={(p) => { setD(JSON.parse(JSON.stringify(p))); setView({ name: 'city', history: ['family'] }); }}
      onAdd={() => { setD(newDraft({ self: false })); setView({ name: 'city', history: ['family'] }); }}
      onCleared={() => { setList([]); setD(newDraft()); setView({ name: 'city', history: [] }); }} />;
  }
  return (
    <Flex vertical gap={16}>
      {view.name === 'city' && (
        <section className="hero">
          <Title level={1}>{t('hero_title')}</Title>
          <Paragraph type="secondary">{t('hero_sub')}</Paragraph>
        </section>
      )}
      <div id="app" aria-live="polite">{body}</div>
    </Flex>
  );
}
