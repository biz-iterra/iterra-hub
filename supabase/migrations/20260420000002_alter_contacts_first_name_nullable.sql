-- contacts.first_name を nullable に変更
-- 昇格フロー（promoteLeadToDeal）でリード名が1単語の場合に first_name が null になるため
-- NOT NULL 制約を外す
ALTER TABLE contacts ALTER COLUMN first_name DROP NOT NULL;
