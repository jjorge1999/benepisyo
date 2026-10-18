import React, { useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Empty from 'antd/es/empty';
import Flex from 'antd/es/flex';
import Input from 'antd/es/input';
import List from 'antd/es/list';
import Segmented from 'antd/es/segmented';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import SearchOutlined from '@ant-design/icons/es/icons/SearchOutlined';
import { BenefitCard } from './Common.jsx';
import { M, useApp } from './shared.js';

const { Title, Paragraph, Text } = Typography;
export const PAGE_SIZE = 8;

/* All benefits for a city. Only the current page of cards is rendered, so long lists stay fast on cheap phones. */
export default function City({ city, benefits }) {
  const { t, link, lang, data, cfg } = useApp();
  const [group, setGroup] = useState('all');
  const [level, setLevel] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const all = useMemo(() => benefits.slice().sort((a, b) => (a.level === b.level ? 0 : a.level === 'local' ? -1 : 1)), [benefits]);
  const filtered = useMemo(() => {
    const hits = q.trim() ? new Set(M.search(all, q, city.id).map((b) => b.id)) : null;
    return all.filter((b) => (group === 'all' || b.groups.includes(group)) && (level === 'all' || b.level === level) && (!hits || hits.has(b.id)));
  }, [all, q, group, level, city.id]);
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  return (
    <Flex vertical gap={16}>
      <section className="hero">
        <Title level={1}>{t('city_page_title', { city: city.name })}</Title>
        <Paragraph type="secondary">{t('city_page_sub', { city: city.name })}</Paragraph>
      </section>
      <Button type="primary" size="large" block href={link('')}>{t('start_quiz')}</Button>
      <Input
        id="search"
        type="search"
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        aria-label={t('search_ph')}
        placeholder={t('search_ph')}
        value={q}
        onChange={(e) => reset(setQ)(e.target.value)}
      />
      <Segmented
        block
        id="level"
        value={level}
        onChange={reset(setLevel)}
        options={[
          { value: 'all', label: t('filter_all') },
          { value: 'local', label: city.name },
          { value: 'national', label: t('level_national_short') }
        ]}
      />
      <Flex gap={6} wrap className="filters" role="group" aria-label="Filter">
        {[{ id: 'all', tl: t('filter_all'), en: t('filter_all') }].concat(data.meta.groups).map((g) => (
          <Tag.CheckableTag key={g.id} data-filter={g.id} aria-pressed={group === g.id} checked={group === g.id} onChange={() => reset(setGroup)(g.id)} className="filter-tag">
            {g[lang]}
          </Tag.CheckableTag>
        ))}
      </Flex>
      <Text type="secondary" id="result-count">{t('showing', { n: filtered.length, total: all.length })}</Text>
      <List
        id="benefit-list"
        dataSource={filtered}
        locale={{ emptyText: <Empty id="search-none" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('search_none')} /> }}
        split={false}
        pagination={filtered.length > PAGE_SIZE ? {
          current: page,
          pageSize: PAGE_SIZE,
          onChange: (p) => { setPage(p); if (typeof window !== 'undefined') document.getElementById('result-count')?.scrollIntoView({ block: 'start' }); },
          showSizeChanger: false,
          align: 'center',
        } : false}
        renderItem={(b) => <List.Item key={b.id} style={{ padding: '5px 0' }}><BenefitCard b={b} today={cfg.today} /></List.Item>}
      />
    </Flex>
  );
}
