// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// A small location tree as GET /api/locations gives it (D82), in tree order.
const place = (id, parentId, siteId, levelTypeId, name, o = {}) => ({
  id,
  parent_id: parentId,
  site_id: siteId,
  level_type_id: levelTypeId,
  name,
  code: null,
  is_active: true,
  version: 1,
  ...o,
});

export const TREE = {
  level_types: [
    { id: 1, name: 'Site', token: 'SITE', offered_to_staff: false, is_active: true },
    { id: 2, name: 'Building', token: 'BUILDING', offered_to_staff: false, is_active: true },
    { id: 3, name: 'Floor', token: 'FLOOR', offered_to_staff: false, is_active: true },
    { id: 4, name: 'Room', token: 'ROOM', offered_to_staff: true, is_active: true },
  ],
  items: [
    place(1, null, 1, 1, 'Lyon Part-Dieu Branch'),
    place(10, 1, 1, 2, 'Main building', { code: '1' }),
    place(11, 10, 1, 3, 'L-1'),
    place(12, 11, 1, 4, 'Plant room'),
    place(13, 10, 1, 3, 'L0'),
    place(14, 13, 1, 4, 'Banking hall'),
    place(15, 13, 1, 4, 'Old archive', { is_active: false }),
    place(2, null, 2, 1, 'Paris HQ'),
    place(20, 2, 2, 2, 'Tower A'),
    place(21, 20, 2, 3, 'L12'),
    place(22, 21, 2, 4, 'Meeting room 12.02'),
    place(23, 21, 2, 4, 'Meeting room 12.10'),
    place(24, 20, 2, 3, 'B1'),
    place(25, 24, 2, 3, 'Plant room B1'),
  ],
};
