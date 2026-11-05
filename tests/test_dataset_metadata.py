import copy
import unittest
from sqlalchemy.orm import Session
from backend.app.db import create_database_engine
from backend.app.models import QuantitativeDataset
from tests import test_quantitative_comparisons as support


class DatasetMetadataTest(unittest.TestCase):
    setUp = support.QuantitativeComparisonAPITest.setUp
    tearDown = support.QuantitativeComparisonAPITest.tearDown
    create_report = support.QuantitativeComparisonAPITest.create_report
    import_sensor_export = support.QuantitativeComparisonAPITest.import_sensor_export

    def dataset(self, name='first', day='2026-08-01', value='100'):
        return self.import_sensor_export(self.create_report(name), name + '.csv', day, [('Source App', 'stable-1', value)], methodology='')

    def endpoint(self, dataset):
        return f"/api/v1/reports/{dataset['report_id']}/quantitative-datasets/{dataset['id']}/metadata"

    def snapshot(self, dataset):
        engine = create_database_engine()
        with Session(engine) as session:
            row = session.get(QuantitativeDataset, dataset['id'])
            result = copy.deepcopy([row.id, row.report_id, row.original_csv, row.content_sha256, row.observations_json])
        engine.dispose()
        return result

    def confirm(self, dataset, overrides=None, basis='provider_documentation'):
        view = self.client.get(self.endpoint(dataset)).json()
        changes = []
        for group in view['groups']:
            values = {field: item['value'] for field, item in group['fields'].items() if item['value'] is not None and item['basis'] not in {'csv', 'provider_documentation'}}
            values['methodology'] = 'Synthetic provider specification: exact count at snapshot'
            values.update(overrides or {})
            for field, value in values.items():
                changes.append(dict(group_key=group['key'], field=field, value=value, basis=basis,
                    source_url='https://example.com/fixture-spec', source_excerpt=f'Synthetic specification: {field} is {value}; counts are per stated scope.', attested=True, replace_existing=True))
        payload = dict(expected_revision=view['revision'], changes=changes)
        response = self.client.put(self.endpoint(dataset), json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json(), payload

    def compare(self, first, second):
        catalog = self.client.get('/api/v1/quantitative-comparisons/datasets?limit=100').json()['items']
        left = next(item for item in catalog if item['id'] == first['id'])
        right = next(item for item in catalog if item['id'] == second['id'])
        metric = left['metrics'][0]
        payload = dict(baseline_dataset_id=first['id'], current_dataset_id=second['id'],
            metric_id=metric['metric_id'], metric_definition=metric['metric_definition'], unit=metric['unit'], methodology=metric['methodology'],
            geo='Worldwide', platform='Unified', baseline_period_key=left['periods'][0]['key'], current_period_key=right['periods'][0]['key'])
        response = self.client.post('/api/v1/quantitative-comparisons/preview', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_recover_reopen_compare_preserves_original_and_duplicate(self):
        first, second = self.dataset(), self.dataset('second', '2026-09-01', '125')
        before = self.snapshot(first)
        self.assertEqual(first['comparison_ready_observations'], 0)
        view, payload = self.confirm(first)
        self.confirm(second)
        self.assertEqual(self.snapshot(first), before)
        retry = self.client.put(self.endpoint(first), json=payload)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json(), view)
        reopened = self.client.get(self.endpoint(first)).json()
        self.assertEqual(reopened, view)
        result = self.compare(first, second)
        self.assertEqual(result['rows'][0]['absolute_change'], 25)
        self.assertEqual(result['rows'][0]['percentage_change'], 25)
        self.assertEqual(result['rows'][0]['baseline']['metadata_provenance']['methodology']['basis'], 'provider_documentation')
        self.assertEqual(result['rows'][0]['baseline']['verification_status'], 'unverified')
        response = self.client.post(f"/api/v1/reports/{first['report_id']}/quantitative-datasets", json={
            'filename': 'copy.csv', 'csv_content': before[2], 'field_mapping': first['field_mapping'],
            'metric_mappings': [{'column': 'Downloads (Absolute)', 'metric_id': 'downloads_absolute', 'metric_definition': 'Downloads', 'methodology': 'different arbitrary string'}],
        })
        self.assertEqual(response.status_code, 200, response.text)
        duplicate = response.json()
        self.assertTrue(duplicate['duplicate'])
        self.assertEqual(duplicate['id'], first['id'])
        self.assertEqual(self.client.get(self.endpoint(first)).json(), view)
        self.assertEqual(self.snapshot(first), before)
        revalidate = self.client.post(self.endpoint(first).replace('/metadata', '/revalidate'))
        self.assertEqual(revalidate.status_code, 200, revalidate.text)
        self.assertEqual(self.client.get(self.endpoint(first)).json(), view)
        self.assertEqual(self.snapshot(first), before)
        self.assertEqual(self.compare(first, second)['rows'][0]['absolute_change'], 25)

    def test_unverified_text_does_not_unlock_comparison(self):
        first, second = self.dataset(), self.dataset('second', '2026-09-01', '100')
        self.confirm(first, basis='po_unverified'); self.confirm(second, basis='po_unverified')
        result = self.compare(first, second)
        self.assertEqual(result['summary']['comparable_apps'], 0)
        self.assertIsNone(result['rows'][0]['absolute_change'])
        self.assertTrue(any('not confirmed' in item for item in result['rows'][0]['reasons']))

    def test_invalid_conflicting_stale_updates_are_atomic(self):
        dataset = self.dataset(); view, payload = self.confirm(dataset)
        before = self.snapshot(dataset)
        conflict = copy.deepcopy(payload); conflict['expected_revision'] = view['revision']
        conflict['changes'][0].update(value='Conflict', replace_existing=False)
        self.assertEqual(self.client.put(self.endpoint(dataset), json=conflict).status_code, 409)
        invalid = copy.deepcopy(payload); invalid['expected_revision'] = view['revision']
        invalid['changes'].append(dict(group_key=view['groups'][0]['key'], field='period_start', value='2026-02-30', basis='po_unverified'))
        self.assertEqual(self.client.put(self.endpoint(dataset), json=invalid).status_code, 422)
        stale = copy.deepcopy(payload); stale['changes'][0]['value'] = 'Changed'
        self.assertEqual(self.client.put(self.endpoint(dataset), json=stale).status_code, 409)
        forbidden = copy.deepcopy(payload); forbidden['changes'][0]['field'] = 'value'
        self.assertEqual(self.client.put(self.endpoint(dataset), json=forbidden).status_code, 422)
        self.assertEqual(self.client.get(self.endpoint(dataset)).json(), view)
        self.assertEqual(self.snapshot(dataset), before)

    def test_documentation_requires_excerpt_and_attestation(self):
        dataset = self.dataset(); view = self.client.get(self.endpoint(dataset)).json()
        change = dict(group_key=view['groups'][0]['key'], field='methodology', value='Placeholder', basis='provider_documentation', source_url='https://example.com')
        response = self.client.put(self.endpoint(dataset), json=dict(expected_revision=0, changes=[change]))
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get(self.endpoint(dataset)).json()['revision'], 0)

    def test_future_and_unequal_intervals_stay_blocked(self):
        first, second = self.dataset(), self.dataset('second', '2026-09-01')
        self.confirm(first, dict(period_semantics='reporting_interval', snapshot_date=None, period_start='2026-09-01', period_end='2026-09-30'))
        self.confirm(second, dict(period_semantics='reporting_interval', snapshot_date=None, period_start='2099-10-01', period_end='2099-10-31'))
        result = self.compare(first, second)
        self.assertFalse(result['period_readiness']['compatible'])
        self.assertIn('future', ' '.join(result['period_readiness']['reasons']))
        self.assertIn('unequal', ' '.join(result['period_readiness']['reasons']))
        self.assertIsNone(result['rows'][0]['absolute_change'])

    def test_missing_metadata_fields_do_not_collapse_distinct_scopes(self):
        report_id = self.create_report('Separate scopes')
        source = self.import_sensor_export(report_id, 'rows.csv', '2026-08-01', [('A', 'a', '1'), ('B', 'b', '2')], methodology='')
        groups = self.client.get(self.endpoint(source)).json()['groups']
        self.assertEqual(len(groups), 1)  # Per-app source URLs are not separate forms.
        self.assertEqual(groups[0]['observations'], 2)
        change = dict(group_key=groups[0]['key'], field='source_reference', value='https://example.com/replacement', basis='po_unverified', replace_existing=False)
        response = self.client.put(self.endpoint(source), json=dict(expected_revision=0, changes=[change]))
        self.assertEqual(response.status_code, 409)  # Never silently replace one of several row-level evidence URLs.
        self.assertEqual(self.client.get(self.endpoint(source)).json()['revision'], 0)


if __name__ == '__main__':
    unittest.main()


class PoConfirmedFromFilenameTest(DatasetMetadataTest):
    """Real Sensor Tower exports: no GEO/period/unit/methodology columns; PO confirms them once."""

    def real_format_csv(self, snapshot: str, values: tuple[str, str]) -> str:
        header = "Unified Name;Unified ID;Category;Platform;Date;Downloads (Absolute);Downloads (YoY Growth)"
        rows = [
            f"Puzzle A;st-a;Games;Unified;{snapshot};{values[0]};{values[0]}",
            f"Puzzle B;st-b;Games;Unified;{snapshot};{values[1]};{values[1]}",
        ]
        return "\n".join([header, *rows]) + "\n"

    def import_real_format(self, report_id: str, filename: str, snapshot: str, values: tuple[str, str]) -> dict:
        body = {
            "filename": filename, "csv_content": self.real_format_csv(snapshot, values),
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform", "snapshot_date": "Date"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "", "methodology": ""}],
        }
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def po_confirm(self, dataset, start, end, unit='lượt tải', methodology='Sensor Tower export, PO confirmed'):
        view = self.client.get(self.endpoint(dataset)).json()
        changes = []
        for group in view['groups']:
            fields = group['fields']
            changes.append(dict(group_key=group['key'], field='geo', value='Worldwide', basis='po_confirmed', source_excerpt='from file name', replace_existing=True))
            changes.append(dict(group_key=group['key'], field='period_semantics', value='reporting_interval', basis='po_confirmed', source_excerpt='from file name', replace_existing=True))
            changes.append(dict(group_key=group['key'], field='period_start', value=start, basis='po_confirmed', source_excerpt='from file name', replace_existing=True))
            changes.append(dict(group_key=group['key'], field='period_end', value=end, basis='po_confirmed', source_excerpt='from file name', replace_existing=True))
            changes.append(dict(group_key=group['key'], field='snapshot_date', value=None, basis='po_confirmed', source_excerpt='replaced by file-name period', replace_existing=True))
            changes.append(dict(group_key=group['key'], field='unit', value=unit, basis='po_confirmed', source_excerpt='PO typed in PO Hub', replace_existing=True))
            changes.append(dict(group_key=group['key'], field='methodology', value=methodology, basis='po_confirmed', source_excerpt='PO typed in PO Hub', replace_existing=True))
        response = self.client.put(self.endpoint(dataset), json=dict(expected_revision=view['revision'], changes=changes))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_po_confirmation_unlocks_equal_window_change_with_visible_source(self):
        report_id = self.create_report('PO confirmed real format')
        first = self.import_real_format(report_id, 'Unified Top Apps Downloads YoY Growth (Aug 5, 2026 - Sep 3, 2026, Worldwide).csv', '2026-08-05', ('100', '50'))
        second = self.import_real_format(report_id, 'Unified Top Apps Downloads YoY Growth (Sep 4, 2026 - Oct 3, 2026, Worldwide).csv', '2026-09-04', ('125', '40'))
        self.assertEqual(first['comparison_ready_observations'], 0)
        self.po_confirm(first, '2026-08-05', '2026-09-03')
        self.po_confirm(second, '2026-09-04', '2026-10-03')
        confirmed = self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets/{second['id']}").json()
        self.assertNotIn('Missing GEO.', confirmed['validation_reasons'])
        self.assertFalse(any('period meaning' in reason for reason in confirmed['validation_reasons']))
        result = self.compare(first, second)
        self.assertEqual(result['summary']['comparable_apps'], 2)
        changes = sorted(row['absolute_change'] for row in result['rows'])
        self.assertEqual(changes, [-10, 25])
        provenance = result['rows'][0]['current']['metadata_provenance']
        self.assertEqual(provenance['geo']['basis'], 'po_confirmed')
        self.assertEqual(provenance['unit']['basis'], 'po_confirmed')

    def test_future_period_and_growth_larger_than_absolute_are_warned(self):
        report_id = self.create_report('Warnings real format')
        csv_text = "Unified Name;Unified ID;Platform;Date;Downloads (Absolute);Downloads (YoY Growth)\nPuzzle A;st-a;Unified;2026-11-20;100;150\n"
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json={
            "filename": "Unified Top Apps (Nov 1, 2026 - Nov 30, 2026, Worldwide).csv", "csv_content": csv_text,
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform", "snapshot_date": "Date"},
            "metric_mappings": [
                {"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": ""},
                {"column": "Downloads (YoY Growth)", "metric_id": "downloads_yoy_growth_absolute", "metric_definition": "Downloads (YoY Growth)", "unit": "downloads", "methodology": ""},
            ],
        })
        self.assertEqual(response.status_code, 201, response.text)
        reasons = " ".join(response.json()["validation_reasons"])
        self.assertIn("sau hôm nay", reasons)
        self.assertIn("lớn hơn giá trị tuyệt đối", reasons)
